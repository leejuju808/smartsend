// Block 24580 — SmartSend Roofing Neighborhood Heatmap v1
// API Route: Get Neighborhood Profile
// GET /api/heatmap/profile?workspace_id=xxx&zip=12345&neighborhood_name=North Valley

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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const zip = searchParams.get("zip");
    const neighborhood_name = searchParams.get("neighborhood_name");

    if (!workspace_id || !zip) {
      return NextResponse.json(
        { error: "workspace_id and zip required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update neighborhood profile
    await supabase.rpc("update_neighborhood_profile", {
      p_workspace_id: workspace_id,
      p_zip: zip,
      p_neighborhood_name: neighborhood_name || null,
    });

    // Fetch neighborhood profile
    let query = supabase
      .from("neighborhood_profiles")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("zip", zip);

    if (neighborhood_name) {
      query = query.eq("neighborhood_name", neighborhood_name);
    } else {
      query = query.is("neighborhood_name", null);
    }

    const { data: profile, error: profileError } = await query.single();

    if (profileError) {
      console.error("Profile error:", profileError);
      return NextResponse.json(
        { error: "Failed to fetch neighborhood profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      profile: {
        zip: profile.zip,
        neighborhood_name: profile.neighborhood_name,
        city: profile.city,
        state: profile.state,
        avg_home_age: profile.avg_home_age,
        avg_roof_size_sqft: profile.avg_roof_size_sqft,
        avg_home_value: profile.avg_home_value,
        median_home_value: profile.median_home_value,
        reply_rate_pct: profile.reply_rate_pct,
        booked_inspections_count: profile.booked_inspections_count,
        jobs_won_count: profile.jobs_won_count,
        avg_job_value: profile.avg_job_value,
        storm_risk: profile.storm_risk,
        storm_history_count: profile.storm_history_count,
        last_storm_date: profile.last_storm_date,
        avg_income: profile.avg_income,
        median_income: profile.median_income,
        income_band: profile.income_band,
        trending_interest_score: profile.trending_interest_score,
        interest_trend: profile.interest_trend,
        opportunity_score: profile.opportunity_score,
        last_updated_at: profile.last_updated_at,
      },
    });
  } catch (err: any) {
    console.error("Neighborhood profile error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch neighborhood profile",
        details: err.message,
      },
      { status: 500 }
    );
  }
}






































