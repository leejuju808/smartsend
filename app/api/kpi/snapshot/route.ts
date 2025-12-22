// Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
// API Endpoint: /api/kpi/snapshot
// Manually triggers KPI snapshot calculation

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { company_id, workspace_id, org_id, date } = body;

    // Calculate snapshot using the database function
    const { data, error } = await supabase.rpc('calculate_daily_kpi_snapshot', {
      p_company_id: company_id || null,
      p_workspace_id: workspace_id || null,
      p_org_id: org_id || null,
      p_date: date || new Date().toISOString().split('T')[0],
    });

    if (error) {
      throw new Error(`Error calculating snapshot: ${error.message}`);
    }

    // Fetch the created snapshot
    const { data: snapshot, error: fetchError } = await supabase
      .from("company_kpi_snapshots")
      .select("*")
      .eq("id", data)
      .single();

    if (fetchError) {
      throw new Error(`Error fetching snapshot: ${fetchError.message}`);
    }

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error("Error calculating snapshot:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



























