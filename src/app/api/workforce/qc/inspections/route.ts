// GET /api/workforce/qc/inspections - List QC inspections
// POST /api/workforce/qc/inspections - Create QC inspection

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("job_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("qc_inspections")
      .select(`
        *,
        foreman:foreman_id (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .order("created_at", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching QC inspections:", error);
      return NextResponse.json(
        { error: "Failed to fetch QC inspections" },
        { status: 500 }
      );
    }

    return NextResponse.json({ inspections: data || [] });
  } catch (error) {
    console.error("Error in QC inspections GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, foreman_id, notes } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing required field: job_id" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create inspection
    const { data: inspection, error: inspectionError } = await supabase
      .from("qc_inspections")
      .insert({
        job_id,
        foreman_id: foreman_id || null,
        notes: notes || null,
        status: "in_progress",
      })
      .select()
      .single();

    if (inspectionError) {
      console.error("Error creating QC inspection:", inspectionError);
      return NextResponse.json(
        { error: "Failed to create QC inspection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ inspection }, { status: 201 });
  } catch (error) {
    console.error("Error in QC inspections POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























