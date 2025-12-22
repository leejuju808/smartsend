import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getPausedState(campaignId: string, leadId?: string, threadId?: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const [
    { data: camp },
    { data: lead },
    threadResult,
    followupResult,
  ] = await Promise.all([
    sb
      .from("campaigns")
      .select("is_paused, pause_reason, pause_on_spike")
      .eq("id", campaignId)
      .maybeSingle(),
    leadId
      ? sb
          .from("campaign_leads")
          .select("paused_at, pause_reason, paused_until")
          .eq("id", leadId)
          .eq("campaign_id", campaignId)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    threadId
      ? sb
          .from("inbox_threads")
          .select("auto_paused_reason, auto_paused_until, ai_intent")
          .eq("id", threadId)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    leadId
      ? sb
          .from("followup_tasks")
          .select("id, due_at, status")
          .eq("lead_id", leadId)
          .eq("kind", "ooo_autonudge")
          .in("status", ["pending", "queued"])
          .order("due_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const thread = threadResult?.data ?? null;
  const autoPausedReason = thread?.auto_paused_reason ?? null;
  const autoPausedUntil = thread?.auto_paused_until ?? null;
  const autoPaused = Boolean(autoPausedReason);
  const followupTask = followupResult?.data ?? null;
  const autoNudgeDueAt = followupTask?.due_at ?? null;

  const leadPaused = Boolean(lead?.paused_at) || autoPaused;
  const leadReason = autoPausedReason ?? lead?.pause_reason ?? null;
  const leadPausedUntil = autoPausedUntil ?? lead?.paused_until ?? null;

  return {
    campaign: {
      isPaused: !!camp?.is_paused,
      reason: camp?.pause_reason ?? null,
      spikeAuto: !!camp?.pause_on_spike,
    },
    lead: {
      isPaused: leadPaused,
      reason: leadReason,
      pausedUntil: leadPausedUntil,
    },
    thread: {
      autoPaused,
      autoPausedReason,
      autoPausedUntil,
      aiIntent: thread?.ai_intent ?? null,
      autoNudgeDueAt,
      hasAutoNudgeTask: Boolean(followupTask),
    },
  };
}
