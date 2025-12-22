import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/approval-queue
 * Get approval queue items with filters
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const status = searchParams.get("status") || "pending"; // pending | approved | rejected
    const campaignId = searchParams.get("campaign_id");
    const submittedBy = searchParams.get("submitted_by"); // filter by submitter
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Verify user is member of workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ 
        error: "You don't have access to this workspace" 
      }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("approval_queue")
      .select(`
        *,
        lead:leads(id, email, first_name, last_name, company),
        campaign:campaigns(id, name, title),
        submitted_by_profile:profiles!approval_queue_submitted_by_fkey(id, email, full_name),
        reviewed_by_profile:profiles!approval_queue_reviewed_by_fkey(id, email, full_name)
      `)
      .eq("workspace_id", workspaceId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (submittedBy) {
      query = query.eq("submitted_by", submittedBy);
    }

    const { data: items, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Get total count
    let countQuery = supabase
      .from("approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", status);

    if (campaignId) {
      countQuery = countQuery.eq("campaign_id", campaignId);
    }

    if (submittedBy) {
      countQuery = countQuery.eq("submitted_by", submittedBy);
    }

    const { count, error: countError } = await countQuery;

    return NextResponse.json({
      items: items || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error: any) {
    console.error("Get approval queue error:", error);
    return NextResponse.json({ 
      error: error.message || "Server error" 
    }, { status: 500 });
  }
}



