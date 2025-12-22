import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const workspaceId = await getCurrentWorkspaceId();
    
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") || "upcoming"; // upcoming, past, all
    const ownerId = url.searchParams.get("owner_id");
    const campaignId = url.searchParams.get("campaign_id");
    const dealStage = url.searchParams.get("deal_stage");
    const minConfidence = url.searchParams.get("min_confidence");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    const now = new Date().toISOString();

    let query = supabase
      .from("meetings")
      .select(`
        *,
        lead:leads(id, first_name, last_name, email, company),
        company:companies(id, name, domain),
        deal:deals(id, title, stage),
        thread:reply_threads(id, subject),
        owner:profiles!meetings_owner_id_fkey(id, email, full_name)
      `)
      .eq("workspace_id", workspaceId);

    // Filter by tab
    if (tab === "upcoming") {
      query = query.gte("start_time", now);
    } else if (tab === "past") {
      query = query.lt("start_time", now);
    }

    // Apply filters
    if (ownerId) {
      query = query.eq("owner_id", ownerId);
    }

    if (minConfidence) {
      query = query.gte("confidence", parseInt(minConfidence));
    }

    if (startDate) {
      query = query.gte("start_time", startDate);
    }

    if (endDate) {
      query = query.lte("start_time", endDate);
    }

    // Sort by start time
    query = query.order("start_time", { ascending: tab === "upcoming" });

    const { data: meetings, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by deal stage if needed (post-query since it's a nested relation)
    let filteredMeetings = meetings || [];
    if (dealStage) {
      filteredMeetings = filteredMeetings.filter(
        (m: any) => m.deal?.stage === dealStage
      );
    }

    if (campaignId) {
      // Need to join through threads to get campaign_id
      const { data: threads } = await supabase
        .from("reply_threads")
        .select("id")
        .eq("campaign_id", campaignId);
      
      const threadIds = threads?.map((t) => t.id) || [];
      filteredMeetings = filteredMeetings.filter(
        (m: any) => m.thread_id && threadIds.includes(m.thread_id)
      );
    }

    return NextResponse.json({ meetings: filteredMeetings });
  } catch (error: any) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch meetings" },
      { status: 500 }
    );
  }
}
