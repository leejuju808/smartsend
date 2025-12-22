// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Color Confirmation
// GET/POST /api/jobs/[jobId]/materials/color-confirmation

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

    // Get color confirmation
    const { data: confirmation, error: confirmationError } = await supabase
      .from("material_color_confirmations")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (confirmationError && confirmationError.code !== "PGRST116") {
      return NextResponse.json(
        { error: confirmationError.message || "Failed to fetch confirmation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      confirmation: confirmation || null,
    });
  } catch (error: any) {
    console.error("Error in color confirmation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const body = await req.json();
    const {
      shingle_brand,
      shingle_color,
      color_swatch_url,
      example_roof_photo_url,
      material_order_id,
    } = body;

    if (!shingle_brand || !shingle_color) {
      return NextResponse.json(
        { error: "shingle_brand and shingle_color are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create color confirmation request
    const { data: confirmation, error: confirmationError } = await supabase
      .from("material_color_confirmations")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        material_order_id: material_order_id || null,
        shingle_brand,
        shingle_color,
        color_swatch_url: color_swatch_url || null,
        example_roof_photo_url: example_roof_photo_url || null,
        status: "pending",
      })
      .select()
      .single();

    if (confirmationError) {
      return NextResponse.json(
        { error: confirmationError.message || "Failed to create confirmation" },
        { status: 500 }
      );
    }

    // TODO: Send email to homeowner with color confirmation request
    // This would be handled by a separate email service

    return NextResponse.json({
      success: true,
      confirmation,
    });
  } catch (error: any) {
    console.error("Error in color confirmation creation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    const body = await req.json();
    const { confirmation_id, homeowner_confirmed, homeowner_response } = body;

    if (homeowner_confirmed === undefined) {
      return NextResponse.json(
        { error: "homeowner_confirmed is required" },
        { status: 400 }
      );
    }

    // Update color confirmation
    const { data: confirmation, error: confirmationError } = await supabase
      .from("material_color_confirmations")
      .update({
        homeowner_confirmed,
        homeowner_confirmed_at: homeowner_confirmed
          ? new Date().toISOString()
          : null,
        homeowner_response: homeowner_response || null,
        status: homeowner_confirmed ? "confirmed" : "rejected",
        ops_alerted: !homeowner_confirmed,
        ops_alerted_at: !homeowner_confirmed ? new Date().toISOString() : null,
      })
      .eq("id", confirmation_id)
      .eq("job_id", jobId)
      .select()
      .single();

    if (confirmationError) {
      return NextResponse.json(
        { error: confirmationError.message || "Failed to update confirmation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      confirmation,
    });
  } catch (error: any) {
    console.error("Error in color confirmation update API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































