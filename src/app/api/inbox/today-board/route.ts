// Block 20190 — Inbox Today Board API
// Returns three buckets: new_leads_today, followups_due_today, hot_attention

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

    const { searchParams } = new URL(req.url);
    const myOnly = searchParams.get("my_only") === "true";

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
        new_leads_today: [],
        followups_due_today: [],
        hot_attention: [],
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
      homeowner_phone,
      property_address,
      lead_stage,
      engagement_level,
      engagement_score,
      thread_estimated_value,
      estimated_job_value,
      next_action_at,
      created_at,
      last_contacted_at,
      last_contact_at,
      assigned_to_user_id,
      assigned_to,
      assignee_id,
      contact_id,
      contacts:contact_id (
        id,
        email,
        first_name,
        last_name,
        phone
      )
    `;

    // Helper function to build base query
    const buildBaseQuery = () => {
      let query = supabase
        .from("inbox_threads")
        .select(selectFields)
        .in("campaign_id", campaignIds)
        .neq("lead_stage", "won")
        .neq("lead_stage", "lost");

      // Filter by assigned user if my_only is true
      // Check multiple possible assignment fields
      if (myOnly) {
        query = query.or(
          `assigned_to_user_id.eq.${user.id},assigned_to.eq.${user.id},assignee_id.eq.${user.id}`
        );
      }

      return query;
    };

    // 1) New leads created today
    let newLeadsQuery = buildBaseQuery()
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString())
      .order("created_at", { ascending: true });

    const { data: newLeads, error: newError } = await newLeadsQuery;

    if (newError) {
      console.error("Today board newLeads error", newError);
    }

    // 2) Follow-ups due today (or overdue)
    let followupsQuery = buildBaseQuery()
      .not("next_action_at", "is", null)
      .lte("next_action_at", todayEnd.toISOString())
      .order("next_action_at", { ascending: true });

    const { data: followups, error: followError } = await followupsQuery;

    if (followError) {
      console.error("Today board followups error", followError);
    }

    // 3) Hot leads needing attention (no contact in last 4 hours)
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    let hotQuery = buildBaseQuery()
      .eq("engagement_level", "hot")
      .order("last_contacted_at", { ascending: true });

    const { data: hotRows, error: hotError } = await hotQuery;

    if (hotError) {
      console.error("Today board hot error", hotError);
    }

    // Filter hot leads that haven't been contacted in last 4 hours
    const hotAttention =
      (hotRows || []).filter((c: any) => {
        const lastContact =
          c.last_contacted_at || c.last_contact_at || null;
        if (!lastContact) return true; // never contacted
        const lastContactDate = new Date(lastContact);
        return lastContactDate < fourHoursAgo;
      }) || [];

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
      homeowner_phone: thread.homeowner_phone || thread.contacts?.phone || null,
      property_address: thread.property_address || null,
      lead_stage: thread.lead_stage || "new",
      engagement_level: thread.engagement_level || null,
      engagement_score: thread.engagement_score ?? 0,
      estimated_job_value:
        thread.thread_estimated_value || thread.estimated_job_value || null,
      next_action_at: thread.next_action_at || null,
      created_at: thread.created_at || null,
      last_contact_at: thread.last_contacted_at || thread.last_contact_at || null,
      assigned_to_user_id:
        thread.assigned_to_user_id || thread.assigned_to || thread.assignee_id || null,
    });

    return NextResponse.json({
      new_leads_today: (newLeads || []).map(transformThread),
      followups_due_today: (followups || []).map(transformThread),
      hot_attention: hotAttention.map(transformThread),
    });
  } catch (error: any) {
    console.error("Today board API error:", error);
    return NextResponse.json(
      { error: "Failed to load today board", details: error.message },
      { status: 500 }
    );
  }
}

