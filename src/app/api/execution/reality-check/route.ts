import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isoDayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    const campaignIdParam = req.nextUrl.searchParams.get("campaign_id");

    // Verify requester is a member of this workspace (do not trust client input)
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const todayStartIso = isoDayStart(now);
    const nowIso = now.toISOString();

    // Scope: either a single campaign (for proof runs) or all campaigns in workspace.
    let campaignIds: string[] = [];

    if (campaignIdParam) {
      const { data: campaign, error: campErr } = await supabaseAdmin
        .from("campaigns")
        .select("id, workspace_id")
        .eq("id", campaignIdParam)
        .maybeSingle();

      if (campErr) {
        return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
      }
      if (!campaign?.id || campaign.workspace_id !== workspaceId) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      campaignIds = [campaign.id];
    } else {
      // Get all campaigns in workspace (outreach sends are campaign-scoped)
      const { data: campaigns, error: campErr } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("workspace_id", workspaceId);

      if (campErr) {
        return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
      }

      campaignIds = (campaigns ?? []).map((c) => c.id).filter(Boolean);
    }

    // Emails sent (today / total)
    // Canonical source for outreach sends is send_logs (via send_queue).
    let emailsSentToday = 0;
    let emailsSentTotal = 0;

    if (campaignIds.length > 0) {
      const { count: sentTodayCount } = await supabaseAdmin
        .from("send_logs")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .in("status", ["sent", "delivered"])
        .gte("sent_at", todayStartIso)
        .lte("sent_at", nowIso);

      const { count: sentTotalCount } = await supabaseAdmin
        .from("send_logs")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .in("status", ["sent", "delivered"]);

      emailsSentToday = sentTodayCount || 0;
      emailsSentTotal = sentTotalCount || 0;
    }

    // Replies + conversations (from smartsend_reply_events; written on inbound reply ingestion)
    let repliesReceivedToday = 0;
    let repliesReceivedTotal = 0;
    let conversationsStartedToday = 0;
    let conversationsStartedTotal = 0;

    if (campaignIds.length > 0) {
      const { count: repliesTodayCount } = await supabaseAdmin
        .from("smartsend_reply_events")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .gte("created_at", todayStartIso)
        .lte("created_at", nowIso);

      const { count: repliesTotalCount } = await supabaseAdmin
        .from("smartsend_reply_events")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds);

      const { count: convosTodayCount } = await supabaseAdmin
        .from("smartsend_reply_events")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("is_first_reply", true)
        .gte("created_at", todayStartIso)
        .lte("created_at", nowIso);

      const { count: convosTotalCount } = await supabaseAdmin
        .from("smartsend_reply_events")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("is_first_reply", true);

      repliesReceivedToday = repliesTodayCount || 0;
      repliesReceivedTotal = repliesTotalCount || 0;
      conversationsStartedToday = convosTodayCount || 0;
      conversationsStartedTotal = convosTotalCount || 0;
    }

    // Lead labels (hot / warm / dead) from leads.outreach_status
    const [{ count: hot }, { count: warm }, { count: dead }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "hot"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "warm"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "dead"),
    ]);

    return NextResponse.json({
      workspace_id: workspaceId,
      as_of: nowIso,
      emails_sent: { today: emailsSentToday, total: emailsSentTotal },
      replies_received: { today: repliesReceivedToday, total: repliesReceivedTotal },
      conversations_started: { today: conversationsStartedToday, total: conversationsStartedTotal },
      leads: {
        hot: hot || 0,
        warm: warm || 0,
        dead: dead || 0,
      },
    });
  } catch (e: any) {
    console.error("reality-check error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}








