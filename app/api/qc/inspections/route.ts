// Block 50000 — SmartSend Roofing QC Inspection System v1
// API Route: QC Inspections CRUD
// GET /api/qc/inspections?job_id=xxx&status=xxx
// POST /api/qc/inspections

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: List QC inspections (with filters)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const job_id = searchParams.get("job_id");
    const status = searchParams.get("status");
    const workspace_id = searchParams.get("workspace_id");

    let query = supabase
      .from("qc_inspections")
      .select(`
        *,
        job:roofing_jobs(id, title, status),
        supervisor:crew_members(id, name),
        photos:qc_photos(*),
        failures:qc_failures(*)
      `)
      .order("created_at", { ascending: false });

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data: inspections, error } = await query;

    if (error) {
      console.error("Error fetching QC inspections:", error);
      return NextResponse.json(
        { error: "Failed to fetch QC inspections" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inspections: inspections || [],
    });
  } catch (error: any) {
    console.error("Error in get QC inspections API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create QC inspection (usually auto-created, but allows manual creation)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const { job_id, workspace_id, supervisor_id, checklist, pass_threshold } = body;

    if (!job_id || !workspace_id) {
      return NextResponse.json(
        { error: "job_id and workspace_id are required" },
        { status: 400 }
      );
    }

    const { data: inspection, error } = await supabase
      .from("qc_inspections")
      .insert({
        job_id,
        workspace_id,
        supervisor_id: supervisor_id || null,
        checklist: checklist || [],
        pass_threshold: pass_threshold || 85,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating QC inspection:", error);
      return NextResponse.json(
        { error: "Failed to create QC inspection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inspection,
    });
  } catch (error: any) {
    console.error("Error in create QC inspection API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































