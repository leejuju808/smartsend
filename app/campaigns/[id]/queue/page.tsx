import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import QueueClient from "./queue-client";

export const dynamic = "force-dynamic";

type QueueRow = {
  id: number;
  status: string;
  scheduled_at: string;
  attempt: number;
  max_attempts: number;
  last_error: string | null;
  lead_id: string;
  identity_id: string;
  account_id: string;
};

export default async function CampaignQueuePage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  const role = await getCampaignRole(campaignId);

  if (!can(role, "canView")) {
    notFound();
  }
  const canSend = can(role, "canSend");

  const supabase = createServerComponentClient({ cookies });

  const { data: queueRows, error: queueErr } = await supabase
    .from("send_queue")
    .select("id,status,scheduled_at,attempt,max_attempts,last_error,lead_id,identity_id,account_id")
    .eq("campaign_id", campaignId)
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(500);

  if (queueErr) {
    console.error("Failed to load send_queue:", queueErr);
  }

  const queue: QueueRow[] = (queueRows ?? []) as QueueRow[];
  const accountId = queue[0]?.account_id ?? null;
  const leadIds = Array.from(new Set(queue.map((q) => q.lead_id).filter(Boolean)));
  const identityIds = Array.from(new Set(queue.map((q) => q.identity_id).filter(Boolean)));

  const [{ data: leadsData }, { data: identitiesData }, { data: pacingData }] = await Promise.all([
    leadIds.length
      ? supabase.from("leads").select("id,email,first_name,last_name").in("id", leadIds)
      : Promise.resolve({ data: [] }),
    identityIds.length
      ? supabase
          .from("send_identities")
          .select("id,email,provider,daily_limit,warmup_enabled,warmup_stage,warmup_max_stage,is_active")
          .in("id", identityIds)
      : Promise.resolve({ data: [] }),
    identityIds.length
      ? supabase
          .from("identity_pacing")
          .select("identity_id,sent_today,sent_last_minute,window_start,minute_start,updated_at")
          .in("identity_id", identityIds)
      : Promise.resolve({ data: [] }),
  ]);

  const leads = new Map(
    (leadsData ?? []).map((l: any) => [
      l.id,
      {
        email: l.email as string,
        firstName: l.first_name as string | null,
        lastName: l.last_name as string | null,
      },
    ]),
  );

  const identities = new Map(
    (identitiesData ?? []).map((i: any) => [
      i.id,
      {
        email: i.email as string,
        provider: i.provider as string,
        dailyLimit: i.daily_limit as number,
        warmupEnabled: Boolean(i.warmup_enabled),
        warmupStage: i.warmup_stage as number | null,
        warmupMaxStage: i.warmup_max_stage as number | null,
        isActive: Boolean(i.is_active),
      },
    ]),
  );

  const pacing = new Map(
    (pacingData ?? []).map((p: any) => [
      p.identity_id,
      {
        sentToday: p.sent_today as number,
        sentLastMinute: p.sent_last_minute as number,
        windowStart: p.window_start as string,
        minuteStart: p.minute_start as string,
        updatedAt: p.updated_at as string,
      },
    ]),
  );

  const leadEmails = Array.from(
    new Set(
      queue
        .map((row) => leads.get(row.lead_id)?.email)
        .filter((email): email is string => Boolean(email)),
    ),
  );

  let suppressions: Array<{ email: string; expires_at: string | null; reason: string }> = [];
  if (accountId && leadEmails.length) {
    const { data: suppressionData, error: suppressionErr } = await supabase
      .from("account_suppressions")
      .select("email,expires_at,reason")
      .eq("account_id", accountId)
      .in("email", leadEmails);

    if (suppressionErr) {
      console.error("Failed to load suppressions:", suppressionErr);
    } else {
      suppressions = suppressionData ?? [];
    }
  }

  const suppressionMap = new Map<string, { expiresAt: string | null; reason: string }>();
  for (const sup of suppressions) {
    suppressionMap.set(sup.email, { expiresAt: sup.expires_at, reason: sup.reason });
  }

  const identitySummaries = Array.from(identities.entries()).map(([id, info]) => {
    const warmupStage = info.warmupStage ?? 0;
    const warmupMax = info.warmupMaxStage ?? 0;
    const warmupRatio = warmupMax > 0 ? warmupStage / warmupMax : 1;
    const capacity = Math.floor(
      Math.min(info.dailyLimit ?? 0, info.warmupEnabled ? info.dailyLimit * warmupRatio : info.dailyLimit),
    );
    const pacingStats = pacing.get(id);
    return {
      id,
      email: info.email,
      provider: info.provider,
      capacity,
      sentToday: pacingStats?.sentToday ?? 0,
      sentLastMinute: pacingStats?.sentLastMinute ?? 0,
      updatedAt: pacingStats?.updatedAt ?? null,
    };
  });

  return (
    <QueueClient
      campaignId={campaignId}
      canSend={canSend}
      initialQueue={queue}
      leadLookup={Object.fromEntries(leads)}
      identitySummaries={identitySummaries}
      suppressionLookup={Object.fromEntries(suppressionMap)}
    />
  );
}

