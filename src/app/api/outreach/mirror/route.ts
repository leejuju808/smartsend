import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isoDaysAgoStartUTC(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Align to UTC day boundary to keep it stable.
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return start.toISOString();
}

/**
 * GET /api/outreach/mirror?workspace_id=...
 *
 * "What happens if you stop?" mirror for the last 30 days.
 * - emails_sent
 * - replies
 * - jobs_booked
 * - estimated_value (simple, consistent heuristic)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    // Verify requester is a member of this workspace.
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const nowIso = new Date().toISOString();
    const startIso = isoDaysAgoStartUTC(30);

    // Campaign ids in this workspace (send logs + reply events are campaign scoped).
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);
    if (campErr) return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
    const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);

    let emailsSent = 0;
    let replies = 0;
    if (campaignIds.length > 0) {
      const [{ count: sentCount }, { count: replyCount }] = await Promise.all([
        supabaseAdmin
          .from("send_logs")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .in("status", ["sent", "delivered"])
          .gte("sent_at", startIso)
          .lte("sent_at", nowIso),
        supabaseAdmin
          .from("smartsend_reply_events")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .gte("created_at", startIso)
          .lte("created_at", nowIso),
      ]);
      emailsSent = sentCount || 0;
      replies = replyCount || 0;
    }

    // Jobs booked (appointments) last 30 days
    let jobsBooked = 0;
    try {
      const { count } = await supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .neq("status", "cancelled")
        .gte("created_at", startIso)
        .lte("created_at", nowIso);
      jobsBooked = count || 0;
    } catch {
      jobsBooked = 0;
    }

    // Estimated value (last 30 days): simple locked heuristic using "active hot/warm updated in window".
    // This keeps it consistent and resistant to schema drift.
    let hotActive = 0;
    let warmActive = 0;
    try {
      const [{ count: hot }, { count: warm }] = await Promise.all([
        supabaseAdmin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("outreach_status", "hot")
          .gte("updated_at", startIso),
        supabaseAdmin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("outreach_status", "warm")
          .gte("updated_at", startIso),
      ]);
      hotActive = hot || 0;
      warmActive = warm || 0;
    } catch {
      hotActive = 0;
      warmActive = 0;
    }
    const estimatedValue = hotActive * 10_000 + warmActive * 5_000;

    return NextResponse.json(
      {
        workspace_id: workspaceId,
        period: { start: startIso, as_of: nowIso, days: 30 },
        metrics: {
          emails_sent: emailsSent,
          replies,
          jobs_booked: jobsBooked,
          estimated_value: estimatedValue,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[outreach/mirror] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





