// Block 22330 — SmartSend Roofing Crew Day Sheet v1
// API Route: Get Crew Day Sheets for Today's Jobs
// GET /api/dashboard/crew-day-sheets

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";

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

    // Get workspace_id from workspace_members
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = membership.workspace_id;
    const today = format(new Date(), "yyyy-MM-dd");

    // Fetch today's jobs with all crew day sheet data
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        status,
        scope_of_work,
        shingle_color,
        dumpster_required,
        dumpster_notes,
        safety_notes,
        homeowner_notes,
        job_value,
        material_status,
        material_supplier_name,
        material_expected_date,
        weather_risk_score,
        weather_risk_label,
        scheduled_start_date,
        scheduled_end_date,
        leads:lead_id (
          address,
          city,
          state,
          zip,
          first_name,
          last_name,
          phone
        ),
        job_crew_assignments (
          crew:crews (
            id,
            name,
            color
          )
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("scheduled_start_date", today)
      .order("scheduled_start_date", { ascending: true });

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json(
        { error: jobsError.message || "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Enrich each job with materials and deliveries
    const enriched = [];
    for (const job of jobs || []) {
      // Fetch material order for this job
      const { data: order, error: orderError } = await supabase
        .from("material_orders")
        .select(`
          id,
          status,
          expected_delivery_date,
          actual_delivery_date,
          items:material_order_items (
            description,
            quantity,
            unit
          )
        `)
        .eq("job_id", job.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderError) {
        console.error(`Error fetching order for job ${job.id}:`, orderError);
      }

      // Fetch deliveries for this job
      const { data: deliveries, error: deliveriesError } = await supabase
        .from("material_deliveries")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: false });

      if (deliveriesError) {
        console.error(`Error fetching deliveries for job ${job.id}:`, deliveriesError);
      }

      // Transform job to match expected structure (alias leads as address)
      const transformedJob = {
        ...job,
        address: job.leads || null,
      };

      enriched.push({
        job: transformedJob,
        materials: order || null,
        deliveries: deliveries || [],
      });
    }

    return NextResponse.json(
      {
        date: today,
        jobs: enriched,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in crew day sheets API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

