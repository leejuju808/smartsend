// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/[id]/schedule
// Same-Day Scheduling Logic

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { tech_id, scheduled_time, price, estimated_duration_minutes } = body;

    if (!tech_id || !scheduled_time) {
      return NextResponse.json(
        { error: "tech_id and scheduled_time are required" },
        { status: 400 }
      );
    }

    // Get repair request
    const { data: repairRequest, error: requestError } = await supabase
      .from("repair_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (requestError || !repairRequest) {
      return NextResponse.json(
        { error: "Repair request not found" },
        { status: 404 }
      );
    }

    // Verify tech exists and is active
    const { data: tech, error: techError } = await supabase
      .from("crew_members")
      .select("id, name, phone, team_id")
      .eq("id", tech_id)
      .eq("is_active", true)
      .single();

    if (techError || !tech) {
      return NextResponse.json(
        { error: "Technician not found or inactive" },
        { status: 404 }
      );
    }

    // Verify tech is in same team
    if (tech.team_id !== repairRequest.team_id) {
      return NextResponse.json(
        { error: "Technician must be in the same team" },
        { status: 400 }
      );
    }

    // Check for scheduling conflicts
    const scheduledDate = new Date(scheduled_time);
    const { data: conflictingJobs } = await supabase
      .from("repair_jobs")
      .select("id, scheduled_time, estimated_duration_minutes")
      .eq("tech_id", tech_id)
      .eq("scheduled_date", scheduledDate.toISOString().split("T")[0])
      .in("status", ["scheduled", "en_route", "on_site", "in_progress"]);

    if (conflictingJobs) {
      const duration = estimated_duration_minutes || repairRequest.ai_estimated_time_minutes || 60;
      const newJobStart = scheduledDate.getTime();
      const newJobEnd = newJobStart + duration * 60000;

      for (const job of conflictingJobs) {
        const jobStart = new Date(job.scheduled_time).getTime();
        const jobDuration = job.estimated_duration_minutes || 60;
        const jobEnd = jobStart + jobDuration * 60000;

        // Check for overlap
        if (
          (newJobStart >= jobStart && newJobStart < jobEnd) ||
          (newJobEnd > jobStart && newJobEnd <= jobEnd) ||
          (newJobStart <= jobStart && newJobEnd >= jobEnd)
        ) {
          return NextResponse.json(
            {
              error: "Scheduling conflict detected",
              conflicting_job_id: job.id,
              suggested_alternatives: await findAlternativeSlots(
                supabase,
                tech_id,
                scheduledDate,
                duration
              ),
            },
            { status: 409 }
          );
        }
      }
    }

    // Get pricing if not provided
    let finalPrice = price;
    if (!finalPrice && repairRequest.ai_predicted_repair_type) {
      const { data: pricing } = await supabase
        .from("repair_pricing_matrix")
        .select("base_price")
        .eq("team_id", repairRequest.team_id)
        .eq("repair_type", repairRequest.ai_predicted_repair_type)
        .eq("is_active", true)
        .single();

      if (pricing) {
        finalPrice = pricing.base_price;
      } else {
        // Use AI estimate
        finalPrice =
          (repairRequest.ai_estimated_cost_min + repairRequest.ai_estimated_cost_max) / 2;
      }
    }

    if (!finalPrice) {
      return NextResponse.json(
        { error: "Price is required and could not be determined automatically" },
        { status: 400 }
      );
    }

    // Create repair job
    const { data: repairJob, error: jobError } = await supabase
      .from("repair_jobs")
      .insert({
        repair_request_id: id,
        team_id: repairRequest.team_id,
        company_id: repairRequest.company_id,
        tech_id,
        scheduled_time: scheduled_time,
        estimated_duration_minutes:
          estimated_duration_minutes ||
          repairRequest.ai_estimated_time_minutes ||
          60,
        price: finalPrice,
        price_breakdown: {
          labor: finalPrice * 0.6,
          materials: finalPrice * 0.3,
          travel: finalPrice * 0.1,
          total: finalPrice,
        },
        status: "scheduled",
      })
      .select("*")
      .single();

    if (jobError) {
      console.error("Error creating repair job:", jobError);
      return NextResponse.json(
        { error: "Failed to create repair job", details: jobError.message },
        { status: 500 }
      );
    }

    // Update repair request status (trigger should handle this, but ensure it)
    await supabase
      .from("repair_requests")
      .update({
        status: "scheduled",
        assigned_tech_id: tech_id,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", id);

    // TODO: Send notification to customer and tech
    // This would integrate with notification system

    return NextResponse.json({
      success: true,
      repair_job: repairJob,
      message: `Repair scheduled for ${new Date(scheduled_time).toLocaleString()}`,
      tech: {
        id: tech.id,
        name: tech.name,
        phone: tech.phone,
      },
    });
  } catch (error: any) {
    console.error("Error in schedule repair API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to find alternative time slots
async function findAlternativeSlots(
  supabase: any,
  techId: string,
  requestedDate: Date,
  durationMinutes: number
): Promise<Array<{ time: string; date: string }>> {
  const alternatives: Array<{ time: string; date: string }> = [];

  // Check same day - try later times
  const sameDaySlots = [
    new Date(requestedDate.getTime() + 2 * 60 * 60000), // +2 hours
    new Date(requestedDate.getTime() + 4 * 60 * 60000), // +4 hours
  ];

  for (const slot of sameDaySlots) {
    if (slot.getHours() < 18) {
      // Before 6 PM
      alternatives.push({
        time: slot.toISOString(),
        date: slot.toISOString().split("T")[0],
      });
    }
  }

  // Check next day
  const nextDay = new Date(requestedDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(8, 0, 0, 0);

  alternatives.push({
    time: nextDay.toISOString(),
    date: nextDay.toISOString().split("T")[0],
  });

  return alternatives.slice(0, 3); // Return top 3 alternatives
}





















