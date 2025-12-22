// Block 73000 — SmartSend Estimate Upload & Send API
// POST /api/estimates/upload
// Uploads an estimate file and sends it to the homeowner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const lead_id = formData.get("lead_id") as string;
    const file = formData.get("file") as File;
    const price = formData.get("price") as string;
    const estimate_request_id = formData.get("estimate_request_id") as string | null;

    if (!lead_id || !file) {
      return NextResponse.json(
        { error: "lead_id and file are required" },
        { status: 400 }
      );
    }

    // Verify lead exists
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, company_id, email, first_name, last_name")
      .eq("id", lead_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Upload file to Supabase Storage
    const fileExt = file.name.split(".").pop();
    const fileName = `estimates/${lead_id}/${Date.now()}.${fileExt}`;
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("files")
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Estimate Upload] Storage error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("files")
      .getPublicUrl(fileName);

    const fileUrl = urlData.publicUrl;

    // Create estimate record
    const { data: estimate, error: createError } = await supabase
      .from("estimates")
      .insert({
        lead_id,
        estimate_request_id: estimate_request_id || null,
        file_url: fileUrl,
        price: price ? parseFloat(price) : null,
        sent_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("[Estimate Upload] Create error:", createError);
      return NextResponse.json(
        { error: createError.message || "Failed to create estimate" },
        { status: 500 }
      );
    }

    // Move lead to "Estimate Sent" stage
    const { error: moveError } = await supabase.rpc("move_lead_to_stage", {
      p_lead_id: lead_id,
      p_stage_name: "Estimate Sent",
      p_workspace_id: workspaceId,
      p_company_id: lead.company_id || null,
    });

    if (moveError) {
      console.error("[Estimate Upload] Move error:", moveError);
      // Don't fail if move fails
    }

    // Schedule auto follow-ups
    const { error: followupError } = await supabase.rpc(
      "schedule_estimate_followups",
      { p_estimate_id: estimate.id }
    );

    if (followupError) {
      console.error("[Estimate Upload] Followup error:", followupError);
      // Don't fail if followup scheduling fails
    }

    // TODO: Send email to homeowner with estimate attached
    // This would integrate with your email sending system
    // For now, we just create the estimate record

    return NextResponse.json({
      success: true,
      estimate,
      file_url: fileUrl,
    });
  } catch (error: any) {
    console.error("[Estimate Upload] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























