// Block 50000 — SmartSend Roofing QC Inspection System v1
// API Route: Homeowner QC Verification
// POST /api/qc/homeowner-verify

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST: Submit homeowner verification (public access via portal token)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const body = await req.json();
    const { job_id, qc_inspection_id, status, feedback, concerns, homeowner_id, portal_token } = body;

    if (!job_id || !status) {
      return NextResponse.json(
        { error: "job_id and status are required" },
        { status: 400 }
      );
    }

    // Validate status
    if (!["approved", "needs_attention", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: approved, needs_attention, or rejected" },
        { status: 400 }
      );
    }

    // If portal_token provided, validate it (for public homeowner access)
    let workspace_id = null;
    if (portal_token) {
      const { data: portal } = await supabase
        .from("homeowner_portals")
        .select("workspace_id, job_id")
        .eq("portal_token", portal_token)
        .single();

      if (!portal || portal.job_id !== job_id) {
        return NextResponse.json(
          { error: "Invalid portal token" },
          { status: 401 }
        );
      }

      workspace_id = portal.workspace_id;
    } else {
      // For authenticated users, get workspace from job
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!authError && user) {
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("workspace_id")
          .eq("id", job_id)
          .single();

        if (job) {
          workspace_id = job.workspace_id;
        }
      }
    }

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Unable to determine workspace" },
        { status: 400 }
      );
    }

    // Create or update homeowner verification
    const { data: existing } = await supabase
      .from("homeowner_qc_verification")
      .select("id")
      .eq("job_id", job_id)
      .single();

    const verificationData: any = {
      job_id,
      workspace_id,
      qc_inspection_id: qc_inspection_id || null,
      homeowner_id: homeowner_id || null,
      status,
      feedback: feedback || null,
      concerns: concerns || null,
      verified_at: new Date().toISOString(),
    };

    let verification;
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("homeowner_qc_verification")
        .update(verificationData)
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating homeowner verification:", updateError);
        return NextResponse.json(
          { error: "Failed to update homeowner verification" },
          { status: 500 }
        );
      }
      verification = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from("homeowner_qc_verification")
        .insert(verificationData)
        .select()
        .single();

      if (createError) {
        console.error("Error creating homeowner verification:", createError);
        return NextResponse.json(
          { error: "Failed to create homeowner verification" },
          { status: 500 }
        );
      }
      verification = created;
    }

    // If needs_attention or rejected, potentially create support ticket
    if (status === "needs_attention" || status === "rejected") {
      // TODO: Integrate with support ticket system if available
      // For now, just mark flag
      await supabase
        .from("homeowner_qc_verification")
        .update({ support_ticket_created: true })
        .eq("id", verification.id);
    }

    return NextResponse.json({
      success: true,
      verification,
    });
  } catch (error: any) {
    console.error("Error in homeowner verification API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































