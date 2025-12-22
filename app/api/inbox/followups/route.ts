// Block 20060 — Follow-Up Queue API
// GET /api/inbox/followups
// Returns overdue, today, and upcoming (next 7 days) follow-ups

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Get campaign IDs for this workspace
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length === 0) {
      return NextResponse.json({
        overdue: [],
        today: [],
        upcoming: [],
      });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Base query fields
    const selectFields = `
      id,
      homeowner_name,
      homeowner_email,
      engagement_level,
      engagement_score,
      next_action_at,
      lead_stage,
      campaign_id,
      contact_id,
      contacts:contact_id (
        id,
        email,
        first_name,
        last_name
      )
    `;

    // Overdue: next_action_at < todayStart
    const { data: overdue, error: overdueError } = await supabase
      .from("inbox_threads")
      .select(selectFields)
      .in("campaign_id", campaignIds)
      .not("next_action_at", "is", null)
      .lt("next_action_at", todayStart.toISOString())
      .neq("lead_stage", "won")
      .neq("lead_stage", "lost")
      .order("next_action_at", { ascending: true });

    if (overdueError) {
      console.error("Overdue fetch error", overdueError);
    }

    // Due today: [todayStart, todayEnd]
    const { data: today, error: todayError } = await supabase
      .from("inbox_threads")
      .select(selectFields)
      .in("campaign_id", campaignIds)
      .not("next_action_at", "is", null)
      .gte("next_action_at", todayStart.toISOString())
      .lte("next_action_at", todayEnd.toISOString())
      .neq("lead_stage", "won")
      .neq("lead_stage", "lost")
      .order("next_action_at", { ascending: true });

    if (todayError) {
      console.error("Today fetch error", todayError);
    }

    // Upcoming (next 7 days)
    const nextWeekEnd = new Date(todayEnd);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

    const { data: upcoming, error: upcomingError } = await supabase
      .from("inbox_threads")
      .select(selectFields)
      .in("campaign_id", campaignIds)
      .not("next_action_at", "is", null)
      .gt("next_action_at", todayEnd.toISOString())
      .lte("next_action_at", nextWeekEnd.toISOString())
      .neq("lead_stage", "won")
      .neq("lead_stage", "lost")
      .order("next_action_at", { ascending: true });

    if (upcomingError) {
      console.error("Upcoming fetch error", upcomingError);
    }

    // Transform data to match expected format
    const transformThread = (thread: any) => ({
      id: thread.id,
      homeowner_name:
        thread.homeowner_name ||
        (thread.contacts
          ? `${thread.contacts.first_name || ""} ${thread.contacts.last_name || ""}`.trim()
          : null) ||
        thread.homeowner_email?.split("@")[0] ||
        thread.contacts?.email?.split("@")[0] ||
        "Homeowner",
      homeowner_email: thread.homeowner_email || thread.contacts?.email || "",
      engagement_level: thread.engagement_level || null,
      engagement_score: thread.engagement_score ?? 0,
      next_action_at: thread.next_action_at,
      lead_stage: thread.lead_stage || "new",
    });

    return NextResponse.json({
      overdue: (overdue || []).map(transformThread),
      today: (today || []).map(transformThread),
      upcoming: (upcoming || []).map(transformThread),
    });
  } catch (error: any) {
    console.error("Follow-ups API error:", error);
    return NextResponse.json(
      { error: "Failed to load follow-ups", details: error.message },
      { status: 500 }
    );
  }
}

