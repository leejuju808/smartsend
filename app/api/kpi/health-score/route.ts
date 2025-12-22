// Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
// API Endpoint: /api/kpi/health-score
// Calculates and returns business health score

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { company_id, workspace_id, org_id, period_start, period_end } = body;

    // Calculate health score using the database function
    const { data, error } = await supabase.rpc('calculate_business_health_score', {
      p_company_id: company_id || null,
      p_workspace_id: workspace_id || null,
      p_org_id: org_id || null,
      p_period_start: period_start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_period_end: period_end || new Date().toISOString().split('T')[0],
    });

    if (error) {
      throw new Error(`Error calculating health score: ${error.message}`);
    }

    // Fetch the created health score
    const { data: healthScore, error: fetchError } = await supabase
      .from("business_health_scores")
      .select("*")
      .eq("id", data)
      .single();

    if (fetchError) {
      throw new Error(`Error fetching health score: ${fetchError.message}`);
    }

    return NextResponse.json({
      success: true,
      data: healthScore,
    });
  } catch (error) {
    console.error("Error calculating health score:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get("company_id");
    const workspaceId = searchParams.get("workspace_id");
    const orgId = searchParams.get("org_id");

    let query = supabase
      .from("business_health_scores")
      .select("*")
      .order("period_end_date", { ascending: false })
      .limit(1);

    if (companyId) {
      query = query.eq("company_id", companyId);
    } else if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data: healthScore, error } = await query;

    if (error) {
      throw new Error(`Error fetching health score: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: healthScore?.[0] || null,
    });
  } catch (error) {
    console.error("Error fetching health score:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



























