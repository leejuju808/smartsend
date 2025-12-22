import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/financial/cashflow/forecast
 * Get cashflow forecast for a company
 * Query params: company_id, start_date, end_date (optional, defaults to next 14 days)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const startDate = searchParams.get("start_date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || 
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    if (!companyId) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    // Get cashflow forecast
    const { data: forecast, error: forecastError } = await supabase.rpc(
      "forecast_cashflow",
      {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate,
      }
    );

    if (forecastError) {
      console.error("Cashflow forecast error:", forecastError);
      return NextResponse.json(
        { error: forecastError.message },
        { status: 500 }
      );
    }

    // Get detailed cashflow events
    const { data: events, error: eventsError } = await supabase
      .from("cashflow_events")
      .select("*")
      .eq("company_id", companyId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    return NextResponse.json({
      forecast: forecast || {},
      events: events || [],
    });
  } catch (error: any) {
    console.error("Get cashflow forecast error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/financial/cashflow/forecast
 * Create a cashflow event
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      job_id,
      company_id,
      workspace_id,
      event_type,
      amount,
      date,
      description,
      reference_number,
      supplier_id,
      subcontractor_id,
      crew_id,
      status = "pending",
    } = body;

    if (!company_id || !event_type || !amount || !date) {
      return NextResponse.json(
        { error: "company_id, event_type, amount, and date are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cashflow_events")
      .insert({
        job_id,
        company_id,
        workspace_id,
        event_type,
        amount,
        date,
        description,
        reference_number,
        supplier_id,
        subcontractor_id,
        crew_id,
        status,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: data });
  } catch (error: any) {
    console.error("Create cashflow event error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















