// Block 22330 — SmartSend Roofing Crew Day Sheet v1
// API Route: Get Single Job Crew Sheet
// GET /api/crew-sheet/[jobId]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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

    // Fetch job with all crew day sheet data
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        *,
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
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

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
      .eq("job_id", jobId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError) {
      console.error("Error fetching order:", orderError);
    }

    // Fetch deliveries for this job
    const { data: deliveries, error: deliveriesError } = await supabase
      .from("material_deliveries")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (deliveriesError) {
      console.error("Error fetching deliveries:", deliveriesError);
    }

    // Transform job to match expected structure (alias leads as address)
    const transformedJob = {
      ...job,
      address: job.leads || null,
    };

    return NextResponse.json(
      {
        job: transformedJob,
        materials: order || null,
        deliveries: deliveries || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in crew sheet API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

