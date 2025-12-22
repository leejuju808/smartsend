// Block 32277 — SmartSend Roofing Warranty Tracker API
// GET /api/service-visits - List service visits
// POST /api/service-visits - Create service visit

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
    const warrantyId = searchParams.get("warranty_id");
    const homeownerId = searchParams.get("homeowner_id");
    const completed = searchParams.get("completed");

    let query = supabase
      .from("service_visits")
      .select(`
        *,
        warranty:warranties(id, job_id),
        homeowner:leads(id, first_name, last_name, email, phone)
      `)
      .order("scheduled_for", { ascending: true, nullsFirst: false });

    if (warrantyId) {
      query = query.eq("warranty_id", warrantyId);
    }

    if (homeownerId) {
      query = query.eq("homeowner_id", homeownerId);
    }

    if (completed !== null) {
      query = query.eq("completed", completed === "true");
    }

    const { data: serviceVisits, error } = await query;

    if (error) {
      console.error("Error fetching service visits:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ service_visits: serviceVisits });
  } catch (error: any) {
    console.error("Error in service visits GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      warranty_id,
      homeowner_id,
      scheduled_for,
      technician,
      notes,
    } = body;

    if (!homeowner_id) {
      return NextResponse.json(
        { error: "homeowner_id is required" },
        { status: 400 }
      );
    }

    const { data: serviceVisit, error: createError } = await supabase
      .from("service_visits")
      .insert({
        warranty_id,
        homeowner_id,
        scheduled_for,
        technician,
        notes,
        completed: false,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating service visit:", createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    // If scheduled, create pipeline task (if pipeline integration exists)
    if (scheduled_for && warranty_id) {
      const { data: warranty } = await supabase
        .from("warranties")
        .select("job_id")
        .eq("id", warranty_id)
        .single();

      if (warranty?.job_id) {
        // Try to create a task in the pipeline system
        try {
          await supabase
            .from("tasks_v3")
            .insert({
              lead_id: homeowner_id,
              task_type: "service_visit",
              title: "Service Visit Scheduled",
              description: notes || "Service visit scheduled",
              due_at: scheduled_for,
              status: "open",
              auto_generated: true,
              auto_source: "warranty_system",
            });
        } catch (taskError) {
          // Task creation is optional, don't fail if it doesn't work
          console.log("Could not create pipeline task:", taskError);
        }
      }
    }

    return NextResponse.json({ service_visit: serviceVisit }, { status: 201 });
  } catch (error: any) {
    console.error("Error in service visits POST:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































