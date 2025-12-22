// Block 45000 — SmartSend Roofing "AI Job Summary + Homeowner Closeout Packet" v1
// API Route: Generate and manage closeout packets

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/[jobId]/closeout-packet
 * Get closeout packet status and data
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get closeout packet
    const { data: packet, error: packetError } = await supabase
      .from("closeout_packets")
      .select(`
        *,
        closeout_media (*),
        closeout_materials (*),
        closeout_replacements (*),
        closeout_change_orders (*)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (packetError && packetError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      return NextResponse.json(
        { error: "Failed to fetch closeout packet" },
        { status: 500 }
      );
    }

    if (!packet) {
      return NextResponse.json(
        { error: "Closeout packet not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ packet });
  } catch (error: any) {
    console.error("Error in GET /api/jobs/[jobId]/closeout-packet:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs/[jobId]/closeout-packet
 * Generate or regenerate closeout packet
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, status")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if closeout packet already exists
    const { data: existingPacket } = await supabase
      .from("closeout_packets")
      .select("id, status")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let packetId: string;

    if (existingPacket) {
      // Update existing packet to pending (will regenerate)
      packetId = existingPacket.id;
      await supabase
        .from("closeout_packets")
        .update({ status: "pending" })
        .eq("id", packetId);
    } else {
      // Create new packet
      const { data: newPacket, error: createError } = await supabase
        .from("closeout_packets")
        .insert({
          job_id: jobId,
          workspace_id: job.workspace_id,
          status: "pending",
        })
        .select("id")
        .single();

      if (createError || !newPacket) {
        return NextResponse.json(
          { error: "Failed to create closeout packet" },
          { status: 500 }
        );
      }

      packetId = newPacket.id;
    }

    // Trigger edge function to generate packet
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-closeout-packet`;
    
    const { data: edgeResponse, error: edgeError } = await serviceSupabase.functions.invoke(
      "generate-closeout-packet",
      {
        body: { packet_id: packetId, job_id: jobId },
      }
    );

    if (edgeError) {
      console.error("Error invoking edge function:", edgeError);
      return NextResponse.json(
        { error: "Failed to generate closeout packet" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      packet_id: packetId,
      message: "Closeout packet generation started",
    });
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/closeout-packet:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/jobs/[jobId]/closeout-packet
 * Update closeout packet (e.g., resend to homeowner)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const { action } = body;
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get closeout packet
    const { data: packet, error: packetError } = await supabase
      .from("closeout_packets")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (packetError || !packet) {
      return NextResponse.json(
        { error: "Closeout packet not found" },
        { status: 404 }
      );
    }

    // Verify access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (action === "resend") {
      // Trigger email resend (will be handled by email service)
      // For now, just update the timestamp
      await supabase
        .from("closeout_packets")
        .update({
          sent_to_homeowner_at: null, // Reset to trigger resend
        })
        .eq("id", packet.id);

      return NextResponse.json({
        success: true,
        message: "Closeout packet will be resent to homeowner",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in PUT /api/jobs/[jobId]/closeout-packet:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































