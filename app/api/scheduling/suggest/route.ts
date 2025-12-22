// Block 242000 — Scheduling Engine v2
// POST /api/scheduling/suggest
// Generate AI-suggested schedule for jobs

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { job_ids, date_range_start, date_range_end, crew_preferences } = body;

    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return NextResponse.json(
        { error: "job_ids array is required" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Fetch jobs with details
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        address,
        job_type,
        job_value,
        scheduled_start_date,
        scheduled_end_date,
        roof_squares,
        complexity_factor
      `)
      .in("id", job_ids)
      .eq("workspace_id", workspaceId);

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json(
        { error: "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Fetch available crews
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select("id, name, color, is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    if (crewsError) {
      console.error("Error fetching crews:", crewsError);
      return NextResponse.json(
        { error: "Failed to fetch crews" },
        { status: 500 }
      );
    }

    // Fetch existing schedules for capacity calculation
    const startDate = date_range_start || new Date().toISOString().split('T')[0];
    const endDate = date_range_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: existingSchedules } = await supabase
      .from("job_schedule")
      .select("crew_id, scheduled_start, scheduled_end")
      .eq("workspace_id", workspaceId)
      .gte("scheduled_start", startDate)
      .lte("scheduled_end", endDate)
      .in("status", ["scheduled", "in_progress"]);

    // AI Scheduling Logic (ScheduleAI + RoutingAI)
    const suggestions = await generateScheduleSuggestions({
      jobs,
      crews,
      existingSchedules: existingSchedules || [],
      startDate,
      endDate,
      crewPreferences: crew_preferences || {},
    });

    return NextResponse.json({
      suggestions,
      metadata: {
        total_jobs: jobs.length,
        total_crews: crews.length,
        date_range: { start: startDate, end: endDate },
      },
    });
  } catch (error: any) {
    console.error("Error in scheduling suggest:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// AI Scheduling Engine
async function generateScheduleSuggestions({
  jobs,
  crews,
  existingSchedules,
  startDate,
  endDate,
  crewPreferences,
}: {
  jobs: any[];
  crews: any[];
  existingSchedules: any[];
  startDate: string;
  endDate: string;
  crewPreferences: Record<string, any>;
}) {
  const suggestions = [];

  // Group jobs by geographic proximity (simple clustering)
  const jobClusters = clusterJobsByLocation(jobs);

  for (const cluster of jobClusters) {
    // Find best crew for this cluster
    const bestCrew = findBestCrewForCluster({
      cluster,
      crews,
      existingSchedules,
      preferences: crewPreferences,
    });

    if (!bestCrew) continue;

    // Calculate optimal schedule for cluster
    const clusterSchedule = calculateClusterSchedule({
      cluster,
      crew: bestCrew,
      existingSchedules,
      startDate,
    });

    suggestions.push({
      cluster_id: cluster.id,
      crew_id: bestCrew.id,
      crew_name: bestCrew.name,
      jobs: cluster.jobs.map((j: any) => ({
        job_id: j.id,
        suggested_start: clusterSchedule.startDate,
        suggested_end: clusterSchedule.endDate,
        estimated_duration_hours: estimateJobDuration(j),
        travel_time_minutes: clusterSchedule.travelTime,
        reasoning: clusterSchedule.reasoning,
      })),
      total_travel_time_saved: clusterSchedule.travelTimeSaved,
    });
  }

  return suggestions;
}

function clusterJobsByLocation(jobs: any[]) {
  // Simple clustering: group jobs by city/neighborhood
  const clusters: Record<string, any[]> = {};

  for (const job of jobs) {
    const key = job.address
      ? job.address.split(",")[0].trim() // Use city or first part of address
      : "unknown";
    
    if (!clusters[key]) {
      clusters[key] = [];
    }
    clusters[key].push(job);
  }

  return Object.entries(clusters).map(([location, jobs], index) => ({
    id: `cluster_${index}`,
    location,
    jobs,
  }));
}

function findBestCrewForCluster({
  cluster,
  crews,
  existingSchedules,
  preferences,
}: {
  cluster: any;
  crews: any[];
  existingSchedules: any[];
  preferences: Record<string, any>;
}) {
  // Score each crew based on:
  // 1. Current capacity
  // 2. Preferences
  // 3. Specialization (if any)

  let bestCrew = null;
  let bestScore = -1;

  for (const crew of crews) {
    const capacity = calculateCrewCapacity(crew.id, existingSchedules);
    const preferenceScore = preferences[crew.id]?.preference || 5;
    const score = capacity * preferenceScore;

    if (score > bestScore) {
      bestScore = score;
      bestCrew = crew;
    }
  }

  return bestCrew;
}

function calculateCrewCapacity(crewId: string, existingSchedules: any[]) {
  const crewSchedules = existingSchedules.filter((s) => s.crew_id === crewId);
  const totalHours = crewSchedules.reduce((sum, s) => {
    const start = new Date(s.scheduled_start);
    const end = new Date(s.scheduled_end);
    return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }, 0);

  // Assume 8 hours per day capacity
  const maxCapacity = 8 * 5; // 5 days
  return Math.max(0, maxCapacity - totalHours);
}

function calculateClusterSchedule({
  cluster,
  crew,
  existingSchedules,
  startDate,
}: {
  cluster: any;
  crew: any;
  existingSchedules: any[];
  startDate: string;
}) {
  // Find next available slot for this crew
  const crewSchedules = existingSchedules
    .filter((s) => s.crew_id === crew.id)
    .sort((a, b) => new Date(a.scheduled_end).getTime() - new Date(b.scheduled_end).getTime());

  let nextAvailable = new Date(startDate);
  if (crewSchedules.length > 0) {
    const lastSchedule = crewSchedules[crewSchedules.length - 1];
    nextAvailable = new Date(lastSchedule.scheduled_end);
    nextAvailable.setDate(nextAvailable.getDate() + 1);
  }

  // Calculate total duration for cluster
  const totalDuration = cluster.jobs.reduce((sum: number, job: any) => {
    return sum + estimateJobDuration(job);
  }, 0);

  const endDate = new Date(nextAvailable);
  endDate.setHours(endDate.getHours() + totalDuration);

  return {
    startDate: nextAvailable.toISOString(),
    endDate: endDate.toISOString(),
    travelTime: 15, // Default travel time between jobs in cluster
    travelTimeSaved: cluster.jobs.length * 30 - 15, // Saved by clustering
    reasoning: `Clustered ${cluster.jobs.length} jobs in ${cluster.location} to minimize travel time`,
  };
}

function estimateJobDuration(job: any): number {
  // AI-based duration estimation
  // Factors: roof_squares, complexity_factor, job_type
  const baseHoursPerSquare = 0.5; // 0.5 hours per square
  const squares = job.roof_squares || 30; // Default 30 squares
  const complexity = job.complexity_factor || 1.0;
  const baseHours = squares * baseHoursPerSquare;
  
  return Math.ceil(baseHours * complexity);
}

























