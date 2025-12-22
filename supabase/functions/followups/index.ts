// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET  = Deno.env.get("CRON_SECRET")!;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function scheduleCandidates() {
  const client = sb();
  const { data: rows, error } = await client.rpc("find_followup_candidates");
  if (error) throw new Error(error.message);
  let enq = 0;
  for (const r of rows ?? []) {
    const { data: guard, error: guardErr } = await client.rpc("can_enqueue_followup", {
      p_campaign: r.campaign_id,
      p_lead: r.lead_id
    });
    if (guardErr) throw new Error(guardErr.message);

    const guardRow = Array.isArray(guard) ? guard?.[0] ?? null : guard ?? null;
    const ok = guardRow?.ok ?? false;
    const reason = guardRow?.reason ?? null;

    if (!ok) {
      let pausedUntil: string | null = null;
      if (reason === "paused_until") {
        const { data: lead } = await client
          .from("campaign_leads")
          .select("paused_until")
          .eq("id", r.lead_id)
          .maybeSingle();
        pausedUntil = lead?.paused_until ?? null;
      }
      await client.from("delivery_events").insert({
        thread_id: r.thread_id,
        campaign_id: r.campaign_id,
        lead_id: r.lead_id,
        event: "enqueue_blocked",
        meta: { reason, paused_until: pausedUntil }
      });
      continue;
    }

    const { data, error: enqueueErr } = await client.rpc("enqueue_followup_task", {
      p_campaign: r.campaign_id,
      p_thread: r.thread_id,
      p_lead: r.lead_id,
      p_run_at: r.run_at,
      p_nudge: r.nudge_no,
      p_payload: r.payload
    });

    if (enqueueErr) {
      const message = enqueueErr.message ?? "";
      if (message.includes("enqueue_blocked")) {
        await client.from("delivery_events").insert({
          thread_id: r.thread_id,
          campaign_id: r.campaign_id,
          lead_id: r.lead_id,
          event: "enqueue_blocked",
          meta: { reason: "db_blocked", detail: message }
        });
        continue;
      }
      throw new Error(message);
    }

    if (data) enq++;
  }
  return enq;
}

async function claimTasks(limit = 30) {
  const client = sb();
  const { data, error } = await client.rpc("claim_followup_tasks", { p_limit: limit });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getContext(row: any) {
  const client = sb();
  const { data: rule } = await client.from("followup_rules")
    .select("tone,length,cta,auto_send")
    .eq("campaign_id", row.campaign_id)
    .maybeSingle();

  const { data: preset } = await client
    .from("rewrite_presets")
    .select("tone,length,cta,variables")
    .eq("campaign_id", row.campaign_id)
    .eq("name", "Follow-up Default")
    .maybeSingle();

  const { data: nm } = await client
    .from("normalized_messages")
    .select("subject, preview_clean, from_email")
    .eq("linked_thread_id", row.thread_id)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1);

  const { data: lead } = await client.from("leads")
    .select("first_name, last_name, company, email")
    .eq("id", row.lead_id)
    .maybeSingle();

  let hydratedVars: Record<string, string> = {};
  try {
    const hv = await client.rpc("hydrate_campaign_vars", {
      p_campaign: row.campaign_id,
      p_lead: row.lead_id
    });
    if (!hv.error && hv.data) {
      hydratedVars = hv.data as Record<string, string>;
    }
  } catch {
    // ignore hydration failures
  }

  const offer = preset?.cta ?? rule?.cta ?? "";
  const finalVars = { ...(preset?.variables ?? {}), ...hydratedVars, offer };

  return {
    tone: preset?.tone ?? rule?.tone ?? "professional",
    length: preset?.length ?? rule?.length ?? "short",
    cta: offer || null,
    vars: finalVars,
    auto_send: !!rule?.auto_send,
    last_inbound: nm?.[0] ?? null,
    lead: lead ?? null
  };
}

async function rewrite(subject: string, bodyHtml: string, ctx: any, campaignId: string, nudgeNo: number) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/rewrite`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({
      subject,
      body_html: bodyHtml,
      tone: ctx.tone,
      goal: "followup",
      length: ctx.length,
      variants: 1,
      context: ctx.vars ?? { offer: ctx.cta ?? "" },
      campaign_id: campaignId,
      source: "followup_engine"
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error ?? "rewrite failed");
  const v = j.variants?.[0];
  if (!v) throw new Error("no variant");
  const subj = v.subject || subject || "Following up";
  return { subject: subj, html: v.html };
}

async function createDraftOrSend(row: any, ctx: any, variant: { subject: string; html: string }) {
  const client = sb();

  const { data: draft, error: derr } = await client
    .from("reply_drafts")
    .insert({
      campaign_id: row.campaign_id,
      thread_id: row.thread_id,
      lead_id: row.lead_id,
      subject: variant.subject,
      body_html: variant.html,
      source: "followup_engine"
    })
    .select("id")
    .maybeSingle();
  if (derr) throw new Error(derr.message);

  if (ctx.auto_send) {
    await client.from("send_queue").insert({
      draft_id: draft?.id,
      campaign_id: row.campaign_id,
      thread_id: row.thread_id,
      lead_id: row.lead_id,
      priority: 5,
      kind: "reply"
    }).catch(() => { /* optional if send_queue not ready */ });
  }
  return draft?.id ?? null;
}

async function complete(row: any) {
  await sb().from("followup_tasks").update({ status: "done", last_error: null }).eq("id", row.id);
}

async function fail(row: any, e: any) {
  const msg = typeof e === "string" ? e : (e?.message ?? JSON.stringify(e));
  const attempts = row.attempts ?? 0;
  const status = attempts >= 5 ? "dead" : "failed";
  const delay = attempts === 0 ? 5 : attempts === 1 ? 15 : attempts === 2 ? 60 : 240; // minutes
  const run_at = new Date(Date.now() + delay * 60 * 1000).toISOString();
  await sb().from("followup_tasks").update({ status, last_error: msg, run_at }).eq("id", row.id);
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "all"; // "schedule" | "do" | "all"

  let enq = 0;
  let done = 0;

  if (mode === "schedule" || mode === "all") {
    enq = await scheduleCandidates();
  }

  if (mode === "do" || mode === "all") {
    const jobs = await claimTasks(25);
    for (const row of jobs) {
      try {
        const ctx = await getContext(row);
        const offer = ctx.vars?.offer ?? ctx.cta ?? "Open to a quick chat?";
        const baselines = {
          subject: "Following up",
          body: `<p>Just circling back on my last note. ${offer}</p>`
        };
        const v = await rewrite(baselines.subject, baselines.body, ctx, row.campaign_id, row.nudge_no);
        await createDraftOrSend(row, ctx, v);
        await complete(row);
        done++;
      } catch (e) {
        await fail(row, e);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, enqueued: enq, processed: done }), {
    headers: { "content-type": "application/json" }
  });
});


