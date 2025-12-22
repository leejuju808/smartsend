// Block 92000 — SmartSend Roofing Warranties API v1
// API Routes for warranty management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: List warranties for a workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const jobId = searchParams.get("job_id");
    const isActive = searchParams.get("is_active");

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

    let query = supabase
      .from("warranties")
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address
        )
      `)
      .order("created_at", { ascending: false });

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching warranties:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch warranties" },
        { status: 500 }
      );
    }

    return NextResponse.json({ warranties: data || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/warranties:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new warranty
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

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
      workspace_id,
      company_id,
      job_id,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      warranty_type,
      warranty_length_years,
      start_date,
      coverage_description,
    } = body;

    if (!workspace_id || !homeowner_name || !warranty_type || !start_date) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, homeowner_name, warranty_type, start_date" },
        { status: 400 }
      );
    }

    // Create the warranty
    const { data: warranty, error: warrantyError } = await supabase
      .from("warranties")
      .insert({
        workspace_id,
        company_id: company_id || null,
        job_id: job_id || null,
        homeowner_name,
        homeowner_email: homeowner_email || null,
        homeowner_phone: homeowner_phone || null,
        warranty_type,
        warranty_length_years: warranty_length_years || null,
        start_date,
        coverage_description: coverage_description || null,
        is_active: true,
      })
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address
        )
      `)
      .single();

    if (warrantyError) {
      console.error("Error creating warranty:", warrantyError);
      return NextResponse.json(
        { error: warrantyError.message || "Failed to create warranty" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { warranty },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/warranties:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
