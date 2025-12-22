// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Mark job step as complete
// POST /api/crew/job-step

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { job_id, crew_id, step } = await req.json();

    if (!job_id || !crew_id || !step) {
      return NextResponse.json(
        { error: "job_id, crew_id, and step are required" },
        { status: 400 }
      );
    }

    // Validate step
    const validSteps = ["arrived", "tear_off", "dry_in", "install", "clean_up", "completed"];
    if (!validSteps.includes(step)) {
      return NextResponse.json(
        { error: `Invalid step. Must be one of: ${validSteps.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check if step already exists for this job/crew
    const { data: existingStep } = await supabase
      .from("roofing_job_steps")
      .select("id")
      .eq("job_id", job_id)
      .eq("crew_id", crew_id)
      .eq("step", step)
      .single();

    if (existingStep) {
      // Update existing step
      const { data: updatedStep, error: updateError } = await supabase
        .from("roofing_job_steps")
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", existingStep.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating job step:", updateError);
        return NextResponse.json(
          { error: "Failed to update job step", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, step: updatedStep });
    } else {
      // Create new step
      const { data: newStep, error: insertError } = await supabase
        .from("roofing_job_steps")
        .insert({
          job_id,
          crew_id,
          step,
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating job step:", insertError);
        return NextResponse.json(
          { error: "Failed to create job step", details: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, step: newStep });
    }
  } catch (error: any) {
    console.error("Error in crew job step API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































