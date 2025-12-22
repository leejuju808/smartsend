// Block 25180 — SmartSend Roofing Job Completion Engine v1
// API Route: Review Submission
// POST /api/jobs/[jobId]/review

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
    const {
      rating,
      feedback_text,
      feedback_category,
      is_private = false,
      review_platform,
      review_url,
      review_text,
    } = body;

    if (!rating || (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Get job and contact info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        workspace_id,
        lead_id,
        leads:lead_id(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const contactId = job.lead_id;

    // Get or create review tracking
    const { data: existingReview } = await supabase
      .from("review_tracking")
      .select("*")
      .eq("job_id", jobId)
      .single();

    let reviewData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      contact_id: contactId,
      updated_at: new Date().toISOString(),
    };

    if (is_private) {
      // Private rating/feedback
      reviewData.private_rating = rating;
      reviewData.private_feedback_text = feedback_text;
      reviewData.private_feedback_received_at = new Date().toISOString();
      
      if (rating < 4) {
        reviewData.status = "private_rating_low";
        reviewData.owner_alerted = false; // Will be alerted by system
      } else {
        reviewData.status = "private_rating_received";
      }
    } else {
      // Public review
      reviewData.public_review_submitted = true;
      reviewData.review_platform = review_platform || "other";
      reviewData.review_url = review_url || null;
      reviewData.review_rating = rating;
      reviewData.review_text = review_text || feedback_text;
      reviewData.review_submitted_at = new Date().toISOString();
      reviewData.status = "public_review_received";
    }

    let review;
    if (existingReview) {
      const { data: updated, error: updateError } = await supabase
        .from("review_tracking")
        .update(reviewData)
        .eq("id", existingReview.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating review:", updateError);
        return NextResponse.json(
          { error: updateError.message || "Failed to update review" },
          { status: 500 }
        );
      }
      review = updated;
    } else {
      reviewData.created_at = new Date().toISOString();
      const { data: created, error: createError } = await supabase
        .from("review_tracking")
        .insert(reviewData)
        .select()
        .single();

      if (createError) {
        console.error("Error creating review:", createError);
        return NextResponse.json(
          { error: createError.message || "Failed to create review" },
          { status: 500 }
        );
      }
      review = created;
    }

    // Update completion tracking
    await supabase
      .from("job_completion_tracking")
      .update({
        review_received_at: new Date().toISOString(),
        review_rating: rating,
        review_platform: review_platform || null,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);

    // If rating is 4+ stars, trigger referral request
    if (rating >= 4) {
      await supabase.rpc("request_referral_automation", { p_job_id: jobId });
    }

    // Log timeline event
    await supabase
      .from("completion_timeline_events")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        event_type: is_private ? "review_received" : "review_received",
        event_message: is_private
          ? `Private rating received: ${rating} stars`
          : `Public review submitted on ${review_platform || "platform"}: ${rating} stars`,
        event_metadata: {
          rating,
          is_private,
          platform: review_platform || null,
        },
      });

    // Update completion status
    await supabase.rpc("update_completion_status", { p_job_id: jobId });

    return NextResponse.json({ review }, { status: 200 });
  } catch (error: any) {
    console.error("Error submitting review:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





































