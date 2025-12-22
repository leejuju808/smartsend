// Block 19600 — SmartSend Owner Inbox v1
// API endpoint for unified inbox replies list

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace
    const { data: membership, error: memErr } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (memErr || !membership) {
      return NextResponse.json({ error: "no_workspace" }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");
    const hasMeetingOnly = searchParams.get("has_meeting_only") === "true";
    const stopFollowupsOnly = searchParams.get("stop_followups_only") === "true";
    const search = searchParams.get("search") || "";
    const dateRange = searchParams.get("date_range") || "7d";

    // Calculate date range
    const now = new Date();
    let since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (dateRange === "24h") {
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (dateRange === "30d") {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const sinceIso = since.toISOString();

    // Build query
    let query = supabase
      .from("reply_logs")
      .select(
        `
        id,
        workspace_id,
        lead_id,
        campaign_id,
        subject,
        body,
        received_at,
        ai_category,
        ai_intent,
        ai_has_meeting,
        ai_stop_followups,
        status,
        owner_user_id,
        meeting_stage,
        deal_value_cents,
        is_suppressed,
        leads (
          email,
          company,
          score_total
        )
        `
      )
      .eq("workspace_id", workspaceId)
      .gte("received_at", sinceIso)
      .order("received_at", { ascending: false })
      .limit(500);

    // Apply filters
    if (category && category !== "all") {
      if (category === "unlabeled") {
        query = query.is("ai_category", null);
      } else {
        query = query.eq("ai_category", category);
      }
    }

    if (hasMeetingOnly) {
      query = query.eq("ai_has_meeting", true);
    }

    if (stopFollowupsOnly) {
      query = query.eq("ai_stop_followups", true);
    }

    if (search) {
      const searchPattern = `%${search}%`;
      query = query.or(`subject.ilike.${searchPattern},body.ilike.${searchPattern}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching inbox replies:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data to match expected format
    const replies = (data || []).map((reply: any) => {
      const leadsData = Array.isArray(reply.leads) ? reply.leads[0] : reply.leads;
      return {
        id: reply.id,
        lead_email: leadsData?.email || null,
        subject: reply.subject,
        received_at: reply.received_at,
        ai_category: reply.ai_category,
        ai_intent: reply.ai_intent,
        ai_has_meeting: reply.ai_has_meeting,
        ai_stop_followups: reply.ai_stop_followups,
        status: reply.status,
        owner_user_id: reply.owner_user_id,
        meeting_stage: reply.meeting_stage,
        deal_value_cents: reply.deal_value_cents,
        is_suppressed: reply.is_suppressed,
        leads: leadsData ? {
          email: leadsData.email,
          company: leadsData.company,
          score_total: leadsData.score_total,
        } : null,
        score_total: leadsData?.score_total || null,
      };
    });

    return NextResponse.json({ replies });
  } catch (error: any) {
    console.error("Error in inbox replies API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
