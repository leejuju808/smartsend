// Block 25140 — SmartSend Roofing Homeowner Experience v1
// API endpoint for submitting homeowner feedback

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { submitHomeownerFeedback } from "@/lib/homeowner-experience/automation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      portalToken, // Optional: for public portal submissions
      workspaceId,
      jobId,
      contactId,
      rating,
      feedbackText,
      feedbackCategory,
    } = body;

    // If portal token provided, validate and get job/contact info
    let finalJobId = jobId;
    let finalContactId = contactId;
    let finalWorkspaceId = workspaceId;

    if (portalToken) {
      const { data: portal } = await supabase
        .from("homeowner_portals")
        .select("job_id, workspace_id")
        .eq("portal_token", portalToken)
        .eq("is_enabled", true)
        .single();

      if (!portal) {
        return NextResponse.json(
          { error: "Invalid portal token" },
          { status: 404 }
        );
      }

      finalJobId = portal.job_id;
      finalWorkspaceId = portal.workspace_id;

      // Get contact from job
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("contact_id, lead_id")
        .eq("id", finalJobId)
        .single();

      if (job?.contact_id) {
        finalContactId = job.contact_id;
      } else if (job?.lead_id) {
        // Get contact from lead
        const { data: lead } = await supabase
          .from("leads")
          .select("contact_id")
          .eq("id", job.lead_id)
          .single();

        if (lead?.contact_id) {
          finalContactId = lead.contact_id;
        }
      }
    }

    // Validate required fields
    if (!finalWorkspaceId || !finalJobId || !finalContactId || !rating) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: workspaceId, jobId, contactId, rating",
        },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Submit feedback
    const result = await submitHomeownerFeedback({
      workspaceId: finalWorkspaceId,
      jobId: finalJobId,
      contactId: finalContactId,
      rating,
      feedbackText,
      feedbackCategory,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to submit feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedbackId: result.feedbackId,
    });
  } catch (error: any) {
    console.error("Error submitting homeowner feedback:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

