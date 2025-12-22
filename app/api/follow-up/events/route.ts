import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/follow-up/events?campaignId=...
 * Paginated list for dashboard
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("follow_up_events")
      .select(
        `
        *,
        contact:contacts(email, first_name, last_name),
        rule:follow_up_rules(type, priority)
      `,
        { count: "exact" }
      )
      .eq("account_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      events: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching follow-up events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























































