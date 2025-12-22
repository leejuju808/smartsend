import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/badleads/stats
 * 
 * Get statistics about bad leads
 * 
 * Query params:
 * - campaign_id: Optional campaign filter
 * - date_from: Optional date filter
 * - date_to: Optional date filter
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

    const searchParams = req.nextUrl.searchParams;
    const campaignId = searchParams.get("campaign_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    // Build base query
    let query = supabase
      .from("bad_leads")
      .select("category, is_suppressed, detected_at")
      .eq("workspace_id", workspaceId);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (dateFrom) {
      query = query.gte("detected_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("detected_at", dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching bad leads stats:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate statistics
    const stats = {
      total: data?.length || 0,
      by_category: {} as Record<string, number>,
      suppressed: 0,
      not_suppressed: 0,
      by_month: {} as Record<string, number>,
    };

    data?.forEach((lead) => {
      // Count by category
      stats.by_category[lead.category] = (stats.by_category[lead.category] || 0) + 1;

      // Count suppressed
      if (lead.is_suppressed) {
        stats.suppressed++;
      } else {
        stats.not_suppressed++;
      }

      // Count by month
      const month = new Date(lead.detected_at).toISOString().slice(0, 7);
      stats.by_month[month] = (stats.by_month[month] || 0) + 1;
    });

    return NextResponse.json({ stats });
  } catch (e: any) {
    console.error("Bad leads stats error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}





















































