// Block 251600 — Crew Time Tracking System
// GET /api/workforce/time/dashboard
// Production manager dashboard for time tracking

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    // Get active clock-ins (currently clocked in)
    const { data: activeClockIns, error: activeError } = await supabase
      .from("crew_time_clock")
      .select(`
        id,
        employee_id,
        job_id,
        clock_in,
        clock_in_lat,
        clock_in_lng,
        employee:workforce_employees!inner(
          id,
          first_name,
          last_name,
          role,
          company_id
        ),
        job:jobs!inner(
          id,
          notes,
          site_lat,
          site_lng
        )
      `)
      .eq("employee.company_id", companyId)
      .is("clock_out", null)
      .order("clock_in", { ascending: false });

    // Get hours per crew today (grouped by job)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const { data: todayHours, error: todayError } = await supabase
      .from("crew_time_clock")
      .select(`
        job_id,
        duration_minutes,
        job:jobs!inner(
          id,
          notes,
          site_lat,
          site_lng
        )
      `)
      .gte("clock_in", today.toISOString())
      .lte("clock_in", todayEnd.toISOString())
      .not("clock_out", "is", null)
      .not("duration_minutes", "is", null);

    // Calculate hours per job today
    const hoursPerJob: Record<string, { job_id: string; job_name: string; total_hours: number; employee_count: number }> = {};
    todayHours?.forEach((entry: any) => {
      const jobId = entry.job_id;
      if (!hoursPerJob[jobId]) {
        hoursPerJob[jobId] = {
          job_id: jobId,
          job_name: entry.job?.notes || "Unknown Job",
          total_hours: 0,
          employee_count: 0,
        };
      }
      hoursPerJob[jobId].total_hours += (entry.duration_minutes || 0) / 60;
      hoursPerJob[jobId].employee_count += 1;
    });

    // Get hours per employee this week
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)

    const { data: weekHours, error: weekError } = await supabase
      .from("crew_time_clock")
      .select(`
        employee_id,
        duration_minutes,
        employee:workforce_employees!inner(
          id,
          first_name,
          last_name,
          role,
          company_id
        )
      `)
      .eq("employee.company_id", companyId)
      .gte("clock_in", weekStart.toISOString())
      .not("clock_out", "is", null)
      .not("duration_minutes", "is", null);

    // Calculate hours per employee this week
    const hoursPerEmployee: Record<string, { employee_id: string; employee_name: string; total_hours: number; job_count: number }> = {};
    weekHours?.forEach((entry: any) => {
      const empId = entry.employee_id;
      if (!hoursPerEmployee[empId]) {
        hoursPerEmployee[empId] = {
          employee_id: empId,
          employee_name: `${entry.employee?.first_name || ""} ${entry.employee?.last_name || ""}`.trim(),
          total_hours: 0,
          job_count: 0,
        };
      }
      hoursPerEmployee[empId].total_hours += (entry.duration_minutes || 0) / 60;
      hoursPerEmployee[empId].job_count += 1;
    });

    // Get clock-ins outside radius (flags)
    const { data: outsideRadius, error: radiusError } = await supabase
      .from("crew_time_clock")
      .select(`
        id,
        employee_id,
        job_id,
        clock_in,
        clock_in_lat,
        clock_in_lng,
        employee:workforce_employees!inner(
          id,
          first_name,
          last_name,
          company_id
        ),
        job:jobs!inner(
          id,
          notes,
          site_lat,
          site_lng
        )
      `)
      .eq("employee.company_id", companyId)
      .not("job.site_lat", "is", null)
      .not("job.site_lng", "is", null)
      .not("clock_in_lat", "is", null)
      .not("clock_in_lng", "is", null);

    // Filter to find entries outside 150 feet radius
    const outsideRadiusFlags = [];
    for (const entry of outsideRadius || []) {
      if (entry.job?.site_lat && entry.job?.site_lng && entry.clock_in_lat && entry.clock_in_lng) {
        const { data: valid } = await supabase.rpc("is_within_radius", {
          lat1: entry.clock_in_lat,
          lng1: entry.clock_in_lng,
          lat2: entry.job.site_lat,
          lng2: entry.job.site_lng,
          radius_feet: 150,
        });

        if (!valid) {
          outsideRadiusFlags.push({
            id: entry.id,
            employee_name: `${entry.employee?.first_name || ""} ${entry.employee?.last_name || ""}`.trim(),
            job_name: entry.job?.notes || "Unknown",
            clock_in: entry.clock_in,
            clock_in_location: { lat: entry.clock_in_lat, lng: entry.clock_in_lng },
            job_location: { lat: entry.job.site_lat, lng: entry.job.site_lng },
          });
        }
      }
    }

    // Get missing clock-outs (clocked in but not out)
    const { data: missingClockOuts, error: missingError } = await supabase
      .from("crew_time_clock")
      .select(`
        id,
        employee_id,
        job_id,
        clock_in,
        employee:workforce_employees!inner(
          id,
          first_name,
          last_name,
          company_id
        ),
        job:jobs!inner(
          id,
          notes
        )
      `)
      .eq("employee.company_id", companyId)
      .is("clock_out", null)
      .lt("clock_in", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Older than 24 hours
      .order("clock_in", { ascending: true });

    return NextResponse.json({
      active_clock_ins: activeClockIns || [],
      hours_per_job_today: Object.values(hoursPerJob),
      hours_per_employee_week: Object.values(hoursPerEmployee),
      flags: {
        clock_ins_outside_radius: outsideRadiusFlags,
        missing_clock_outs: missingClockOuts || [],
      },
    });
  } catch (error: any) {
    console.error("Error in time dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























