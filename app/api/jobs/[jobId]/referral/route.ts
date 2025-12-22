// Block 25180 — SmartSend Roofing Job Completion Engine v1
// API Route: Referral Submission
// POST /api/jobs/[jobId]/referral

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    const body = await req.json();
    const { referral_contacts } = body; // Array of {name, email, phone, notes}

    if (!referral_contacts || !Array.isArray(referral_contacts) || referral_contacts.length === 0) {
      return NextResponse.json(
        { error: "referral_contacts array required" },
        { status: 400 }
      );
    }

    // Get job and contact info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        workspace_id,
        lead_id
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get or create referral tracking
    const { data: existingReferral } = await supabase
      .from("referral_tracking")
      .select("*")
      .eq("job_id", jobId)
      .single();

    const referralCount = referral_contacts.length;
    const existingContacts = existingReferral?.referral_contacts || [];
    const updatedContacts = [...existingContacts, ...referral_contacts];

    let referralData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      contact_id: job.lead_id,
      referral_count: (existingReferral?.referral_count || 0) + referralCount,
      referral_contacts: updatedContacts,
      status: "referral_received",
      updated_at: new Date().toISOString(),
    };

    let referral;
    if (existingReferral) {
      const { data: updated, error: updateError } = await supabase
        .from("referral_tracking")
        .update(referralData)
        .eq("id", existingReferral.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating referral:", updateError);
        return NextResponse.json(
          { error: updateError.message || "Failed to update referral" },
          { status: 500 }
        );
      }
      referral = updated;
    } else {
      referralData.created_at = new Date().toISOString();
      referralData.referral_requested_at = new Date().toISOString();
      const { data: created, error: createError } = await supabase
        .from("referral_tracking")
        .insert(referralData)
        .select()
        .single();

      if (createError) {
        console.error("Error creating referral:", createError);
        return NextResponse.json(
          { error: createError.message || "Failed to create referral" },
          { status: 500 }
        );
      }
      referral = created;
    }

    // Update completion tracking
    await supabase
      .from("job_completion_tracking")
      .update({
        referral_received: true,
        referral_count: referral.referral_count,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);

    // Log timeline event
    await supabase
      .from("completion_timeline_events")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        event_type: "referral_received",
        event_message: `${referralCount} referral(s) received`,
        event_metadata: {
          referral_count: referralCount,
          contacts: referral_contacts,
        },
      });

    // Update completion status
    await supabase.rpc("update_completion_status", { p_job_id: jobId });

    return NextResponse.json({ referral }, { status: 200 });
  } catch (error: any) {
    console.error("Error submitting referral:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





































