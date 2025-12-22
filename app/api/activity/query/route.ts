import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leadId, companyId, campaignId, eventType, limit = 100 } = await req.json();

    let query = supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (leadId) {
      query = query.eq("lead_id", leadId);
    }
    
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    
    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }
    
    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error querying activity log:", error);
      return NextResponse.json(
        { error: "Failed to query activity log" },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: data || [] });
  } catch (error) {
    console.error("Error in activity query API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}












