// Block 26720 — SmartSend Roofing Renewal & Maintenance Route Engine v1
// API Route: Renewal Opportunities
// GET /api/renewal-opportunities - Get renewal opportunities for current workspace
// POST /api/renewal-opportunities - Generate new renewal opportunities

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");
    const opportunityType = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "100");

    // Build query
    let query = supabase
      .from("roofing_renewal_opportunities")
      .select(`
        *,
        roofing_customers!inner (
          id,
          customer_name,
          email,
          phone,
          address,
          city,
          state,
          zip_code,
          total_jobs_count,
          total_revenue
        ),
        roofing_customer_roof_profile (
          id,
          roof_material,
          last_roof_date,
          property_address,
          property_city,
          property_state,
          property_zip_code
        ),
        roofing_jobs (
          id,
          title,
          job_value
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("recommended_date", { ascending: true })
      .limit(limit);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (opportunityType) {
      query = query.eq("opportunity_type", opportunityType);
    }

    const { data: opportunities, error } = await query;

    if (error) {
      console.error("Error fetching renewal opportunities:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Format response
    const formattedOpportunities = opportunities?.map((opp) => ({
      id: opp.id,
      customer_id: opp.customer_id,
      customer_name: opp.roofing_customers?.customer_name || "Unknown",
      customer_email: opp.roofing_customers?.email,
      customer_phone: opp.roofing_customers?.phone,
      customer_address: opp.roofing_customers?.address,
      opportunity_type: opp.opportunity_type,
      recommended_date: opp.recommended_date,
      priority: opp.priority,
      reason: opp.reason,
      status: opp.status,
      scheduled_date: opp.scheduled_date,
      estimated_value: opp.estimated_value,
      roof_material: opp.roofing_customer_roof_profile?.roof_material,
      last_roof_date: opp.roofing_customer_roof_profile?.last_roof_date,
      property_address: opp.roofing_customer_roof_profile?.property_address,
      created_at: opp.created_at,
      updated_at: opp.updated_at,
    })) || [];

    return NextResponse.json({
      success: true,
      opportunities: formattedOpportunities,
      count: formattedOpportunities.length,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;

    // Generate renewal opportunities
    const { data: renewalCount, error: renewalError } = await supabase.rpc(
      "generate_renewal_opportunities",
      {
        p_workspace_id: workspaceId,
        p_lookback_years: 2,
      }
    );

    if (renewalError) {
      console.error("Error generating renewal opportunities:", renewalError);
      return NextResponse.json(
        { error: renewalError.message },
        { status: 500 }
      );
    }

    // Generate seasonal maintenance opportunities
    const currentMonth = new Date().getMonth() + 1;
    let season: string | null = null;
    if (currentMonth >= 1 && currentMonth <= 5) {
      season = "spring";
    } else if (currentMonth >= 6 && currentMonth <= 12) {
      season = "fall";
    }

    let maintenanceCount = 0;
    if (season) {
      const { data: maintenanceData, error: maintenanceError } = await supabase.rpc(
        "generate_seasonal_maintenance_opportunities",
        {
          p_workspace_id: workspaceId,
          p_season: season,
        }
      );

      if (maintenanceError) {
        console.error("Error generating maintenance opportunities:", maintenanceError);
      } else {
        maintenanceCount = maintenanceData || 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Renewal opportunities generated",
      renewal_opportunities_created: renewalCount || 0,
      maintenance_opportunities_created: maintenanceCount,
      season: season || "none",
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      },
      { status: 500 }
    );
  }
}



































