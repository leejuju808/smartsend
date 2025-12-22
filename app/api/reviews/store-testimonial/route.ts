// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// API Route: Store Testimonial
// POST /api/reviews/store-testimonial
// Saves testimonial content, photo, and video for marketing use

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const {
      review_request_id,
      content,
      rating,
      homeowner_name,
      photo_url,
      video_url,
    } = body;

    if (!review_request_id || !content) {
      return NextResponse.json(
        { error: "review_request_id and content are required" },
        { status: 400 }
      );
    }

    // Get review request to get workspace and job info
    const { data: reviewRequest, error: fetchError } = await supabase
      .from("review_requests")
      .select("workspace_id, job_id, homeowner_id, response_rating")
      .eq("id", review_request_id)
      .single();

    if (fetchError || !reviewRequest) {
      return NextResponse.json(
        { error: "Review request not found" },
        { status: 404 }
      );
    }

    // Use rating from review request if not provided
    const testimonialRating = rating || reviewRequest.response_rating;

    // Check if testimonial already exists
    const { data: existingTestimonial } = await supabase
      .from("testimonials")
      .select("id")
      .eq("review_request_id", review_request_id)
      .single();

    let testimonial;

    if (existingTestimonial) {
      // Update existing testimonial
      const { data: updated, error: updateError } = await supabase
        .from("testimonials")
        .update({
          content,
          rating: testimonialRating,
          homeowner_name,
          photo_url: photo_url || null,
          video_url: video_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingTestimonial.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update testimonial" },
          { status: 500 }
        );
      }

      testimonial = updated;
    } else {
      // Create new testimonial
      const { data: created, error: createError } = await supabase
        .from("testimonials")
        .insert({
          workspace_id: reviewRequest.workspace_id,
          homeowner_id: reviewRequest.homeowner_id,
          job_id: reviewRequest.job_id,
          review_request_id,
          content,
          rating: testimonialRating,
          homeowner_name,
          photo_url: photo_url || null,
          video_url: video_url || null,
          approved: false,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating testimonial:", createError);
        return NextResponse.json(
          { error: "Failed to create testimonial" },
          { status: 500 }
        );
      }

      testimonial = created;
    }

    return NextResponse.json(
      {
        success: true,
        testimonial,
        message: "Testimonial stored successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error storing testimonial:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































