import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const runtime = "nodejs";

function startOfTodayUtcIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function countSentEmailsBestEffort(args: {
  supabase: Awaited<ReturnType<typeof getServerSupabase>>;
  workspaceId: string;
  campaignId?: string | null;
  sinceIso: string;
}) {
  const { supabase, workspaceId, campaignId, sinceIso } = args;

  // Preferred: send_logs if it has workspace_id + sent_at
  {
    let q = supabase
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("sent_at", sinceIso);
    if (campaignId) q = q.eq("campaign_id", campaignId);

    // Some schemas use status...
    const r1 = await q.eq("status", "sent" as any);
    if (!r1.error) return r1.count ?? 0;

    // ...others use event.
    let q2 = supabase
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", sinceIso)
      .eq("event", "sent" as any);
    if (campaignId) q2 = q2.eq("campaign_id", campaignId);
    const r2 = await q2;
    if (!r2.error) return r2.count ?? 0;
  }

  // Fallback: send_queue with sent_at
  {
    let q = supabase
      .from("send_queue")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("sent_at", sinceIso)
      .in("status", ["sent", "delivered", "completed"] as any);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    const { count, error } = await q;
    if (!error) return count ?? 0;
  }

  return 0;
}

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "no_workspace" }, { status: 400 });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const sinceIso = startOfTodayUtcIso();

  const [{ count: repliesCount }, { count: hot }, { count: warm }, { count: dead }] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("last_reply_at", sinceIso),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "hot"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "warm"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "dead"),
    ]);

  const emailsSent = await countSentEmailsBestEffort({
    supabase,
    workspaceId,
    campaignId,
    sinceIso,
  });

  const hotLeads = hot ?? 0;
  const warmLeads = warm ?? 0;
  const deadLeads = dead ?? 0;

  const jobsInConversation = hotLeads + warmLeads;
  const estimatedJobValue = hotLeads * 10_000 + warmLeads * 5_000;

  return NextResponse.json({
    period: { since: sinceIso },
    emailsSent,
    replies: repliesCount ?? 0,
    hotLeads,
    warmLeads,
    deadLeads,
    jobsInConversation,
    estimatedJobValue,
    assumptions: { hotValue: 10000, warmValue: 5000 },
  });
}








