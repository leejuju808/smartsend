// Block 38900 — SmartSend Roofing Customer Portal v1
// API Route: GET /api/portal/data?token=...
// Fetch portal data for homeowner (public access via token)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Use service role to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // Validate token
    const { data: validation, error: validationError } = await supabase.rpc(
      "validate_portal_token",
      { p_token: token }
    );

    if (validationError || !validation?.valid) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const { lead_id, job_id } = validation;

    // Fetch job data with all related information
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address_line1,
          address_line2,
          city,
          state,
          zip_code
        )
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Fetch job stage events (timeline)
    const { data: stageEvents } = await supabase
      .from("job_stage_events")
      .select("*")
      .eq("job_id", job_id)
      .order("changed_at", { ascending: true });

    // Fetch job materials
    const { data: materials } = await supabase
      .from("job_materials")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    // Fetch job photos
    const { data: photos } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    // Fetch change orders
    const { data: changeOrders } = await supabase
      .from("change_orders")
      .select(`
        *,
        change_order_photos (
          id,
          photo_url,
          label
        )
      `)
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    // Fetch job costs (for transparency)
    const { data: costs } = await supabase
      .from("job_costs")
      .select("total_cost, margin")
      .eq("job_id", job_id)
      .single();

    // Fetch invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select(`
        *,
        invoice_line_items (
          id,
          description,
          quantity,
          unit_price,
          total
        )
      `)
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    // Fetch payments
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .in(
        "invoice_id",
        invoices?.map((inv) => inv.id) || []
      )
      .order("created_at", { ascending: false });

    // Fetch job schedule
    const { data: schedule } = await supabase
      .from("job_schedule")
      .select("*")
      .eq("job_id", job_id)
      .order("start_date", { ascending: true })
      .limit(1)
      .single();

    // Calculate progress percentage based on stage
    const stageProgress: Record<string, number> = {
      estimate: 10,
      approved: 20,
      insurance: 30,
      materials: 40,
      scheduled: 60,
      in_progress: 80,
      completed: 100,
    };

    const progressPercent = stageProgress[job.stage] || 0;

    return NextResponse.json({
      ok: true,
      job: {
        ...job,
        progress_percent: progressPercent,
      },
      lead: job.leads,
      timeline: stageEvents || [],
      materials: materials || [],
      photos: photos || [],
      change_orders: changeOrders || [],
      costs: costs || null,
      invoices: invoices || [],
      payments: payments || [],
      schedule: schedule || null,
    });
  } catch (error: any) {
    console.error("Error in /api/portal/data:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































