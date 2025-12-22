// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/[id]/route-tech
// Technician Routing Engine - finds best available tech

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
    const { preferred_date, preferred_time } = body;

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

    // Get all active technicians for this team
    const { data: technicians, error: techError } = await supabase
      .from("crew_members")
      .select("id, name, phone, role, team_id")
      .eq("team_id", repairRequest.team_id)
      .eq("is_active", true);

    if (techError || !technicians || technicians.length === 0) {
      return NextResponse.json(
        { error: "No active technicians found for this team" },
        { status: 404 }
      );
    }

    // Get skill level required
    const skillLevel = repairRequest.ai_skill_level_required || "intermediate";

    // Get scheduled jobs for each tech to find availability
    const targetDate = preferred_date
      ? new Date(preferred_date)
      : new Date(); // Today if not specified

    // Find available technicians
    const availableTechs = await Promise.all(
      technicians.map(async (tech) => {
        // Get tech's scheduled jobs for target date
        const { data: scheduledJobs } = await supabase
          .from("repair_jobs")
          .select("scheduled_time, estimated_duration_minutes, status")
          .eq("tech_id", tech.id)
          .eq("scheduled_date", targetDate.toISOString().split("T")[0])
          .in("status", ["scheduled", "en_route", "on_site", "in_progress"]);

        // Calculate availability windows
        const busySlots: Array<{ start: Date; end: Date }> = [];
        if (scheduledJobs) {
          scheduledJobs.forEach((job) => {
            const start = new Date(job.scheduled_time);
            const duration = job.estimated_duration_minutes || 60;
            const end = new Date(start.getTime() + duration * 60000);
            busySlots.push({ start, end });
          });
        }

        // Calculate workload (number of jobs)
        const workload = scheduledJobs?.length || 0;

        // Calculate score (lower is better)
        // Prefer techs with fewer jobs, matching skill level
        let score = workload * 10; // Base score on workload

        // Skill level matching bonus (lower score = better)
        const skillMatch = checkSkillMatch(tech.role, skillLevel);
        if (skillMatch) {
          score -= 5; // Bonus for skill match
        }

        return {
          tech,
          workload,
          busySlots,
          score,
          available: true, // For now, assume all are available
        };
      })
    );

    // Sort by score (best first)
    availableTechs.sort((a, b) => a.score - b.score);

    // Get best match
    const bestTech = availableTechs[0];

    if (!bestTech) {
      return NextResponse.json(
        { error: "No available technicians found" },
        { status: 404 }
      );
    }

    // Find earliest available time slot
    const availableSlot = findEarliestSlot(
      bestTech.busySlots,
      targetDate,
      repairRequest.ai_estimated_time_minutes || 60
    );

    return NextResponse.json({
      success: true,
      recommended_tech: {
        id: bestTech.tech.id,
        name: bestTech.tech.name,
        phone: bestTech.tech.phone,
        workload: bestTech.workload,
        distance_miles: null, // Could add geolocation calculation
      },
      available_slot: availableSlot
        ? {
            start_time: availableSlot.start.toISOString(),
            end_time: availableSlot.end.toISOString(),
            date: availableSlot.start.toISOString().split("T")[0],
          }
        : null,
      alternatives: availableTechs.slice(1, 4).map((t) => ({
        id: t.tech.id,
        name: t.tech.name,
        workload: t.workload,
      })),
    });
  } catch (error: any) {
    console.error("Error in route-tech API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to check skill match
function checkSkillMatch(techRole: string | null, requiredSkill: string): boolean {
  if (!techRole) return false;

  const roleSkillMap: Record<string, string> = {
    foreman: "expert",
    lead: "advanced",
    installer: "intermediate",
    laborer: "basic",
  };

  const techSkill = roleSkillMap[techRole.toLowerCase()] || "basic";
  const skillLevels = ["basic", "intermediate", "advanced", "expert"];
  const techLevel = skillLevels.indexOf(techSkill);
  const requiredLevel = skillLevels.indexOf(requiredSkill);

  return techLevel >= requiredLevel;
}

// Helper function to find earliest available slot
function findEarliestSlot(
  busySlots: Array<{ start: Date; end: Date }>,
  targetDate: Date,
  durationMinutes: number
): { start: Date; end: Date } | null {
  // Sort busy slots by start time
  const sortedBusy = [...busySlots].sort((a, b) => a.start.getTime() - b.start.getTime());

  // Business hours: 8 AM to 6 PM
  const businessStart = new Date(targetDate);
  businessStart.setHours(8, 0, 0, 0);
  const businessEnd = new Date(targetDate);
  businessEnd.setHours(18, 0, 0, 0);

  // If no busy slots, return first available (8 AM)
  if (sortedBusy.length === 0) {
    return {
      start: businessStart,
      end: new Date(businessStart.getTime() + durationMinutes * 60000),
    };
  }

  // Check if slot before first busy job works
  const firstBusy = sortedBusy[0];
  const slotBeforeFirst = {
    start: businessStart,
    end: new Date(businessStart.getTime() + durationMinutes * 60000),
  };

  if (slotBeforeFirst.end <= firstBusy.start) {
    return slotBeforeFirst;
  }

  // Check gaps between busy slots
  for (let i = 0; i < sortedBusy.length - 1; i++) {
    const currentEnd = sortedBusy[i].end;
    const nextStart = sortedBusy[i + 1].start;

    const gapDuration = (nextStart.getTime() - currentEnd.getTime()) / 60000; // minutes

    if (gapDuration >= durationMinutes) {
      return {
        start: currentEnd,
        end: new Date(currentEnd.getTime() + durationMinutes * 60000),
      };
    }
  }

  // Check after last busy slot
  const lastBusy = sortedBusy[sortedBusy.length - 1];
  const slotAfterLast = {
    start: lastBusy.end,
    end: new Date(lastBusy.end.getTime() + durationMinutes * 60000),
  };

  if (slotAfterLast.end <= businessEnd) {
    return slotAfterLast;
  }

  // If same day not available, suggest next day
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(8, 0, 0, 0);

  return {
    start: nextDay,
    end: new Date(nextDay.getTime() + durationMinutes * 60000),
  };
}





















