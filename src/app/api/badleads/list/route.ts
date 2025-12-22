import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/badleads/list
 * 
 * List bad leads with filtering options
 * 
 * Query params:
 * - category: Filter by category (hard_bounce, soft_bounce, spam_complaint, not_interested, time_waster, duplicate, bad_data)
 * - campaign_id: Filter by campaign
 * - date_from: Filter from date
 * - date_to: Filter to date
 * - source: Filter by source
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 50)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_workspace_id")
      .eq("id", user.id)
      .single();

    const workspaceId = profile?.current_workspace_id;
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const category = searchParams.get("category");
    const campaignId = searchParams.get("campaign_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const source = searchParams.get("source");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from("bad_leads")
      .select(`
        *,
        lead:leads(id, email, first_name, last_name),
        contact:contacts(id, email, first_name, last_name),
        campaign:campaigns(id, name)
      `, { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("detected_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (dateFrom) {
      query = query.gte("detected_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("detected_at", dateTo);
    }

    if (source) {
      query = query.eq("detection_method", source);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching bad leads:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (e: any) {
    console.error("Bad leads list error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}





















































