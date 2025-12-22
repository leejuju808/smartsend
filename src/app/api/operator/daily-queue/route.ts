import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type DailyOperatorQueueRow = {
  id: string;
  workspace_id: string;
  item_type: "hot_reply" | "stalled_estimate" | "followup_due" | string;
  urgency: number;
  revenue_potential: number | string | null;
  waiting_seconds: number | string | null;

  lead_id: string | null;
  lead_name: string | null;
  lead_email: string | null;
  homeowner_id: string | null;
  estimate_id: string | null;
  company_id: string | null;
  thread_id?: string | null;

  estimate_sent_at: string | null;
  estimate_status: string | null;
  estimate_followup_status: string | null;
  next_followup_at: string | null;
  next_followup_step: number | null;
  followup_message_preview: string | null;
  sent_to_email: string | null;

  rank: number;
  decision_reason?: string | null;
};

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("daily_operator_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("rank", { ascending: true })
    .limit(250);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load daily operator queue", details: error.message },
      { status: 500 }
    );
  }

  const items = (rows ?? []) as unknown as DailyOperatorQueueRow[];

  // Autopilot continuity guard: surface if sending is paused in this workspace.
  // (We treat multiple pause mechanisms as "paused": status, is_paused, paused_by_guard.)
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, status, is_paused, paused_by_guard")
    .eq("workspace_id", workspaceId)
    .limit(500);

  const pausedCampaigns =
    (campaigns ?? []).filter((c: any) => {
      const status = String(c?.status ?? "").toLowerCase();
      const statusPaused = status === "paused";
      const isPaused = Boolean(c?.is_paused);
      const guardPaused = Boolean(c?.paused_by_guard);
      return statusPaused || isPaused || guardPaused;
    }) ?? [];

  const hot = items.filter((i) => i.item_type === "hot_reply");
  const stalled = items.filter((i) => i.item_type === "stalled_estimate");
  const due = items.filter((i) => i.item_type === "followup_due");

  const atRisk = [...stalled, ...due].reduce((sum, i) => sum + asNumber(i.revenue_potential), 0);

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    autopilot: {
      paused_campaigns_count: pausedCampaigns.length,
      guard_paused_campaigns_count: pausedCampaigns.filter((c: any) => Boolean(c?.paused_by_guard)).length,
    },
    summary: {
      total_action_items: items.length,
      hot_leads_needing_response: hot.length,
      estimates_waiting_on_approval: stalled.length,
      followups_sending_today: due.length,
      potential_revenue_at_risk: atRisk,
    },
    items,
  });
}










