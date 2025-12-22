// Block 20040 — Inbox List with Priority Queue
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// GET handler for priority queue inbox list
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;
    
    const status = searchParams.get("status") || "open";
    const sort = searchParams.get("sort") || "priority";
    const engagement_level = searchParams.get("engagement_level") || "all";
    const assigned_to = searchParams.get("assigned_to"); // User ID for "My Queue" filter

    // Get workspace ID from active workspace
    const workspaceId = await getActiveWorkspaceId();
    
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // First, get campaign IDs for this workspace
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return NextResponse.json(
        { error: "Failed to load campaigns" },
        { status: 500 }
      );
    }

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length === 0) {
      return NextResponse.json({ conversations: [] }, { status: 200 });
    }

    // Build base query - filter by campaign IDs
    let query = supabase
      .from("inbox_threads")
      .select(`
        id,
        contact_id,
        campaign_id,
        homeowner_name,
        homeowner_email,
        last_message_preview,
        engagement_level,
        engagement_score,
        lead_stage,
        thread_estimated_value,
        unread_inbound_count,
        status,
        updated_at,
        last_message_at,
        created_at,
        assigned_to_user_id,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("status", status)
      .in("campaign_id", campaignIds);

    // Block 268200 — Owner Attention Filter:
    // Only Hot + Warm should surface. Dead leads are removed elsewhere (lead_stage=lost/status=closed).
    // If caller requests "all" (or "cold"), we still restrict to hot/warm.
    if (engagement_level === "hot" || engagement_level === "warm") {
      query = query.eq("engagement_level", engagement_level);
    } else {
      query = query.in("engagement_level", ["hot", "warm"]);
    }

    // Filter by assigned_to_user_id (for "My Queue" mode)
    if (assigned_to) {
      query = query.eq("assigned_to_user_id", assigned_to);
    }

    // Sort modes
    if (sort === "priority") {
      // Priority sort: hot → warm → cold, then by engagement_score and recent updates
      // Note: PostgreSQL will sort NULLS LAST by default, but we want hot first
      // Since engagement_level is text ('hot', 'warm', 'cold'), we need to handle ordering
      // For v1, we'll use a CASE expression to map to numeric order
      query = query
        .order("engagement_level", { 
          ascending: true,
          nullsFirst: false 
        })
        .order("engagement_score", { 
          ascending: false
        })
        .order("updated_at", { 
          ascending: false
        });
    } else if (sort === "newest") {
      query = query.order("updated_at", { ascending: false });
    } else if (sort === "oldest") {
      query = query.order("updated_at", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error("Inbox list error", error);
      return NextResponse.json(
        { error: "Failed to load inbox" },
        { status: 500 }
      );
    }

    // Transform data to match expected format
    const conversations = (data || []).map((thread: any) => ({
      id: thread.id,
      homeowner_name: thread.homeowner_name || 
        (thread.contacts ? `${thread.contacts.first_name || ''} ${thread.contacts.last_name || ''}`.trim() : null) ||
        thread.homeowner_email?.split('@')[0] ||
        thread.contacts?.email?.split('@')[0] ||
        'Unknown',
      homeowner_email: thread.homeowner_email || thread.contacts?.email || '',
      last_message_preview: thread.last_message_preview || '',
      engagement_level: thread.engagement_level || null,
      engagement_score: thread.engagement_score || 0,
      lead_stage: thread.lead_stage || 'new',
      estimated_job_value: thread.thread_estimated_value || null,
      unread_inbound_count: thread.unread_inbound_count || 0,
      status: thread.status,
      updated_at: thread.updated_at,
      last_message_at: thread.last_message_at,
      created_at: thread.created_at,
      contact_id: thread.contact_id,
      campaign_id: thread.campaign_id,
      assigned_to_user_id: thread.assigned_to_user_id || null,
    }));

    // For priority sort, we need to manually sort by engagement_level since
    // PostgreSQL text sorting doesn't naturally put 'hot' before 'warm' before 'cold'
    if (sort === "priority") {
      const levelOrder: Record<string, number> = { hot: 1, warm: 2, cold: 3 };
      conversations.sort((a: any, b: any) => {
        const aLevel = levelOrder[a.engagement_level] || 999;
        const bLevel = levelOrder[b.engagement_level] || 999;
        if (aLevel !== bLevel) return aLevel - bLevel;
        if (b.engagement_score !== a.engagement_score) return b.engagement_score - a.engagement_score;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }

    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error: any) {
    console.error("Error in inbox list API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Keep POST handler for backward compatibility
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      workspaceId,
      search,
      category,
      sentiment,
      limit = 50,
      offset = 0,
    } = await req.json();

    // Get workspace ID from request or active workspace
    const finalWorkspaceId = workspaceId || await getActiveWorkspaceId();
    
    if (!finalWorkspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("inbox_replies_view")
      .select("*")
      .eq("workspace_id", finalWorkspaceId)
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq("category", category);
    }
    
    if (sentiment) {
      query = query.eq("sentiment", sentiment);
    }
    
    if (search) {
      query = query.or(
        `body.ilike.%${search}%,lead_email.ilike.%${search}%,company.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching inbox replies:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ replies: data || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in inbox list API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
