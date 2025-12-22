// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Upload receipt for cost item
// POST /api/jobs/[jobId]/costs/receipt/upload

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Verify job exists and belongs to team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", jobId)
      .eq("team_id", teamId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const costItemId = formData.get("cost_item_id") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF and images are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Upload file to storage
    const fileBuffer = await file.arrayBuffer();
    const timestamp = Date.now();
    const fileName = `${jobId}/${timestamp}-${file.name}`;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("job-cost-receipts")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage
      .from("job-cost-receipts")
      .getPublicUrl(fileName);

    // If cost_item_id provided, update the cost item with receipt URL
    if (costItemId) {
      const { error: updateError } = await supabaseAdmin
        .from("job_cost_items")
        .update({
          receipt_url: publicUrl,
          receipt_file_name: file.name,
        })
        .eq("id", costItemId)
        .eq("job_id", jobId);

      if (updateError) {
        console.error("Error updating cost item:", updateError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({
      success: true,
      receipt_url: publicUrl,
      file_name: file.name,
      cost_item_id: costItemId || null,
    });
  } catch (error: any) {
    console.error("Error in upload receipt route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































