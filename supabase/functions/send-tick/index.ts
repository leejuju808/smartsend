// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendEmailViaProvider } from "../_shared/senders.ts";
import type { Provider as RealProvider } from "../_shared/oauth.ts";

type Provider = RealProvider | "sim";

type QueueRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  step_no: number;
  due_at: string;
  to_email: string | null;
  provider: Provider | null;
  subject: string | null;
  provider_thread_id: string | null;
  last_inbound_provider_message_id: string | null;
  from_account_id: string | null;
  account_id?: string | null;
};

type CampaignWithAccount = {
  id: string;
  from_account_id: string | null;
  connected_accounts?: Array<{ id: string; provider: Provider | null }>;
};

type ProviderResult = {
  ok: boolean;
  errorCode?: string;
  retryAfter?: number;
  providerMessageId?: string;
  providerThreadId?: string;
  provider?: Provider;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_MAX = 20;
const LOOKAHEAD_MIN = 5;

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  const { data: campaigns, error: campaignsError } = await sb
    .from("campaigns")
    .select(
      "id, from_account_id, connected_accounts!campaigns_from_account_id_fkey(id, provider)"
    )
    .not("from_account_id", "is", null)
    .limit(50);

  if (campaignsError) {
    console.error("campaign fetch error", campaignsError);
    return new Response("campaign fetch error", { status: 500 });
  }

  if (!campaigns?.length) {
    return new Response("no accounts", { status: 200 });
  }

  for (const camp of campaigns as CampaignWithAccount[]) {
    const account = camp.connected_accounts?.[0];
    if (!account?.id) {
      continue;
    }

    const ensure = await sb.rpc("ensure_rate_state", { p_account: account.id });
    if (ensure.error) {
      console.error("ensure_rate_state error", ensure.error);
      continue;
    }

    const { data: nextSend, error: nextErr } = await sb.rpc("next_send_time", {
      p_account: account.id,
    });
    if (nextErr) {
      console.error("next_send_time error", nextErr);
      continue;
    }

    const nextAllowed = nextSend ? new Date(nextSend as string) : null;
    if (nextAllowed && nextAllowed.getTime() > now.getTime()) {
      continue;
    }

    const { data: locked } = await lockDueRows(sb, camp.id, BATCH_MAX, LOOKAHEAD_MIN);
    const rows = (locked ?? []) as QueueRow[];
    if (!rows.length) {
      continue;
    }

    for (const row of rows) {
      const { data: safety, error: safetyError } = await sb
        .from("campaign_safety")
        .select("paused, pause_reason")
        .eq("campaign_id", row.campaign_id)
        .maybeSingle();
      if (safetyError) {
        console.error("campaign_safety fetch error", safetyError);
      }
      if (safety?.paused) {
        const resumeAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        await reschedule(sb, row.id, resumeAt);
        continue;
      }

      const { data: when, error: whenError } = await sb.rpc("next_send_time", {
        p_account: account.id,
      });
      if (whenError) {
        console.error("next_send_time error", whenError);
        await reschedule(sb, row.id, null);
        continue;
      }

      const allowedAt = when ? new Date(when as string) : null;
      if (allowedAt && allowedAt.getTime() > Date.now()) {
        const jitterMs = Math.floor(Math.random() * 5000);
        const iso = new Date(allowedAt.getTime() + jitterMs).toISOString();
        await reschedule(sb, row.id, iso);
        continue;
      }

      const { data: enforcedAt, error: enforceError } = await sb.rpc(
        "enforce_account_hours",
        {
          p_account: account.id,
          p_due: row.due_at,
        }
      );
      if (enforceError) {
        console.error("enforce_account_hours error", enforceError);
      } else if (enforcedAt) {
        const enforcedDate = new Date(enforcedAt as string);
        if (enforcedDate.getTime() > Date.now()) {
          await reschedule(sb, row.id, enforcedDate.toISOString());
          continue;
        }
      }

      const domain =
        row.to_email?.split("@")[1]?.toLowerCase() ?? null;
      const { data: domGate, error: domError } = await sb.rpc(
        "domain_warmup_gate",
        {
          p_account: account.id,
          p_domain: domain,
        }
      );
      if (domError) {
        console.error("domain_warmup_gate error", domError);
      } else if (Array.isArray(domGate) && domGate.length > 0) {
        const gate = domGate[0] as { allowed_at: string | null; reason: string | null };
        if (gate?.reason) {
          await reschedule(sb, row.id, gate.allowed_at ?? null);
          continue;
        }
      }

      const result = await sendViaProvider((account.provider ?? "sim") as Provider, row);

      const record = await sb.rpc("record_send_attempt", {
        p_account: account.id,
        p_success: result.ok,
        p_error_code: result.errorCode ?? null,
        p_retry_after: result.retryAfter ?? null,
      });
      if (record.error) {
        console.error("record_send_attempt error", record.error);
      }

      if (result.ok) {
        await markSent(
          sb,
          row,
          account.id,
          (result.provider ?? account.provider ?? "sim") as Provider,
          result.providerMessageId ?? null,
          result.providerThreadId ?? null
        );
        await sb.rpc("bump_domain_warmup", {
          p_account: account.id,
          p_email: row.to_email,
        });
      } else {
        await reschedule(sb, row.id, null);
      }
    }
  }

  return new Response("tick ok", { status: 200 });
});

async function lockDueRows(
  sb: SupabaseClient,
  campaignId: string,
  limit: number,
  lookaheadMin: number
): Promise<{ data: QueueRow[] | null }> {
  const { data, error } = await sb.rpc("lock_due_rows", {
    p_campaign: campaignId,
    p_limit: limit,
    p_lookahead_min: lookaheadMin,
  });
  if (error) {
    console.error("lock_due_rows error", error);
    return { data: null };
  }
  return { data: (data as QueueRow[]) ?? null };
}

async function reschedule(sb: SupabaseClient, queueId: string, iso: string | null) {
  const { error } = await sb.rpc("reschedule_queue_row", {
    p_queue_id: queueId,
    p_due_at: iso,
  });
  if (error) {
    console.error("reschedule_queue_row error", error);
  }
}

async function markSent(
  sb: SupabaseClient,
  row: QueueRow,
  accountId: string,
  provider: Provider,
  providerMessageId: string | null,
  providerThreadId: string | null
) {
  const { error: delErr } = await sb.from("send_queue").delete().eq("id", row.id);
  if (delErr) {
    console.error("delete queue err", delErr);
  }

  const { error: logErr } = await sb.from("send_logs").insert({
    queue_id: row.id,
    campaign_id: row.campaign_id,
    lead_id: row.lead_id,
    step_no: row.step_no,
    account_id: accountId,
    provider,
    provider_message_id: providerMessageId,
    provider_thread_id: providerThreadId,
    to_email: row.to_email ?? null,
    subject_snapshot: row.subject ?? null,
    status: "sent",
  });
  if (logErr) {
    console.error("send_logs insert error", logErr);
  }

  const { error: statusErr } = await sb
    .from("campaign_leads")
    .update({ status: "sent" })
    .eq("campaign_id", row.campaign_id)
    .eq("lead_id", row.lead_id)
    .neq("status", "replied");
  if (statusErr) {
    console.error("campaign_leads update error", statusErr);
  }
}

async function sendViaProvider(provider: Provider, row: QueueRow): Promise<ProviderResult> {
  // Load account again (we need tokens)
  const accountId = row.from_account_id ?? row.account_id ?? null;
  const { data: acct, error } = await sb
    .from("connected_accounts")
    .select("id, provider, access_token, refresh_token, expires_at, email, meta")
    .eq("id", accountId ?? "")
    .maybeSingle();

  if (error) {
    console.error("sendViaProvider account fetch error", error);
  }

  if (!acct) return { ok: false, errorCode: "no_account" };

  const attempt = await sendEmailViaProvider(provider as RealProvider, {
    account: acct as any,
    to: row.to_email ?? "",
    subject: row.subject,
    text: (row as any).body_text ?? (row as any).body ?? undefined,
    html: (row as any).body_html ?? undefined,
    inReplyToMessageId: row.last_inbound_provider_message_id ?? null,
    threadId: row.provider_thread_id ?? null,
  });

  return attempt;
}
