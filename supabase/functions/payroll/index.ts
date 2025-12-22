import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Block 51000 — SmartSend Roofing Payroll Edge Functions
 * 
 * Routes:
 * - POST /payroll/clock-in
 * - POST /payroll/clock-out
 * - POST /payroll/calc-piecework
 * - POST /payroll/run
 * - GET /payroll/forecast
 */

interface ClockInRequest {
  member_id: string;
  job_id: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface ClockOutRequest {
  timecard_id: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface PieceworkRequest {
  member_id: string;
  job_id: string;
  squares?: number;
  ridge_feet?: number;
  plywood_sheets?: number;
  vents_count?: number;
  removal_squares?: number;
  additional_items?: Record<string, any>;
  photos?: string[];
}

interface PayrollRunRequest {
  workspace_id: string;
  period_start: string; // ISO date
  period_end: string; // ISO date
  pay_date?: string; // ISO date
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/payroll", "");

    // Route based on path
    if (path === "/clock-in" && req.method === "POST") {
      return await handleClockIn(req);
    } else if (path === "/clock-out" && req.method === "POST") {
      return await handleClockOut(req);
    } else if (path === "/calc-piecework" && req.method === "POST") {
      return await handleCalcPiecework(req);
    } else if (path === "/run" && req.method === "POST") {
      return await handlePayrollRun(req);
    } else if (path === "/forecast" && req.method === "GET") {
      return await handleForecast(req);
    } else {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * POST /payroll/clock-in
 * Validates GPS, creates timecard or updates it, marks time as "active"
 */
async function handleClockIn(req: Request) {
  const body: ClockInRequest = await req.json();
  const { member_id, job_id, latitude, longitude, address } = body;

  if (!member_id || !job_id) {
    return new Response(
      JSON.stringify({ error: "member_id and job_id are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get pay settings to check GPS requirements
  const { data: paySettings, error: settingsError } = await supabase
    .from("crew_pay_settings")
    .select("*")
    .eq("member_id", member_id)
    .eq("is_active", true)
    .single();

  if (settingsError && settingsError.code !== "PGRST116") {
    return new Response(
      JSON.stringify({ error: "Failed to fetch pay settings", details: settingsError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify GPS if required
  let gps_verified = false;
  let gps_in = null;

  if (paySettings?.require_gps_verification && latitude && longitude) {
    // Call GPS verification function
    const { data: verified, error: gpsError } = await supabase.rpc("verify_gps_location", {
      p_job_id: job_id,
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_meters: paySettings.job_site_radius_meters || 100,
    });

    if (gpsError) {
      return new Response(
        JSON.stringify({ error: "GPS verification failed", details: gpsError.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    gps_verified = verified || false;

    gps_in = {
      lat: latitude,
      lng: longitude,
      address: address || null,
      accuracy: null,
      timestamp: new Date().toISOString(),
    };
  }

  // Check if there's an active timecard for this member/job
  const { data: existingTimecard } = await supabase
    .from("timecards")
    .select("*")
    .eq("member_id", member_id)
    .eq("job_id", job_id)
    .eq("status", "active")
    .single();

  if (existingTimecard) {
    // Update existing timecard
    const { data, error } = await supabase
      .from("timecards")
      .update({
        clock_in: new Date().toISOString(),
        gps_in,
        gps_verified,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingTimecard.id)
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to update timecard", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ timecard: data, message: "Clock-in updated" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } else {
    // Create new timecard
    const { data, error } = await supabase
      .from("timecards")
      .insert({
        member_id,
        job_id,
        clock_in: new Date().toISOString(),
        gps_in,
        gps_verified,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to create timecard", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ timecard: data, message: "Clock-in successful" }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /payroll/clock-out
 * Calculates hours, calculates overtime, calculates pay, closes timecard
 */
async function handleClockOut(req: Request) {
  const body: ClockOutRequest = await req.json();
  const { timecard_id, latitude, longitude, address } = body;

  if (!timecard_id) {
    return new Response(
      JSON.stringify({ error: "timecard_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get timecard
  const { data: timecard, error: timecardError } = await supabase
    .from("timecards")
    .select("*")
    .eq("id", timecard_id)
    .single();

  if (timecardError || !timecard) {
    return new Response(
      JSON.stringify({ error: "Timecard not found", details: timecardError?.message }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Prepare GPS out data
  let gps_out = null;
  if (latitude && longitude) {
    gps_out = {
      lat: latitude,
      lng: longitude,
      address: address || null,
      accuracy: null,
      timestamp: new Date().toISOString(),
    };
  }

  // Update timecard with clock-out
  // The trigger will automatically calculate hours, overtime, and pay
  const { data, error } = await supabase
    .from("timecards")
    .update({
      clock_out: new Date().toISOString(),
      gps_out,
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", timecard_id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to clock out", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      timecard: data,
      message: "Clock-out successful",
      total_hours: data.total_hours,
      overtime_hours: data.overtime_hours,
      total_pay: data.total_pay,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * POST /payroll/calc-piecework
 * Triggered when job marked complete or when materials logged
 * Calculates piecework pay for each crew member
 */
async function handleCalcPiecework(req: Request) {
  const body: PieceworkRequest = await req.json();
  const {
    member_id,
    job_id,
    squares,
    ridge_feet,
    plywood_sheets,
    vents_count,
    removal_squares,
    additional_items,
    photos,
  } = body;

  if (!member_id || !job_id) {
    return new Response(
      JSON.stringify({ error: "member_id and job_id are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check if piecework record already exists
  const { data: existing } = await supabase
    .from("piecework_records")
    .select("*")
    .eq("member_id", member_id)
    .eq("job_id", job_id)
    .single();

  const recordData: any = {
    member_id,
    job_id,
    squares: squares || 0,
    ridge_feet: ridge_feet || 0,
    plywood_sheets: plywood_sheets || 0,
    vents_count: vents_count || 0,
    removal_squares: removal_squares || 0,
    additional_items: additional_items || {},
    photos: photos || [],
  };

  let data;
  let error;

  if (existing) {
    // Update existing record
    const result = await supabase
      .from("piecework_records")
      .update(recordData)
      .eq("id", existing.id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } else {
    // Create new record
    const result = await supabase
      .from("piecework_records")
      .insert(recordData)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to save piecework record", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // The trigger will automatically calculate total_pay
  return new Response(
    JSON.stringify({
      piecework_record: data,
      message: "Piecework calculated",
      total_pay: data.total_pay,
    }),
    { status: existing ? 200 : 201, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * POST /payroll/run
 * Creates payroll run: pulls all timecards for period, sums hourly + OT + piecework, generates totals, exports CSV
 */
async function handlePayrollRun(req: Request) {
  const body: PayrollRunRequest = await req.json();
  const { workspace_id, period_start, period_end, pay_date } = body;

  if (!workspace_id || !period_start || !period_end) {
    return new Response(
      JSON.stringify({ error: "workspace_id, period_start, and period_end are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create payroll run
  const { data: payrollRun, error: runError } = await supabase
    .from("payroll_runs")
    .insert({
      workspace_id,
      period_start,
      period_end,
      pay_date: pay_date || period_end,
      status: "processing",
    })
    .select()
    .single();

  if (runError) {
    return new Response(
      JSON.stringify({ error: "Failed to create payroll run", details: runError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get all crew members in workspace
  const { data: members, error: membersError } = await supabase
    .from("crew_members")
    .select("id")
    .eq("workspace_id", workspace_id)
    .eq("is_active", true);

  if (membersError) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch crew members", details: membersError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const memberIds = members?.map((m) => m.id) || [];

  // Get all timecards for period
  const { data: timecards, error: timecardsError } = await supabase
    .from("timecards")
    .select("*")
    .in("member_id", memberIds)
    .gte("clock_in", period_start)
    .lte("clock_in", `${period_end}T23:59:59`)
    .eq("status", "completed");

  if (timecardsError) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch timecards", details: timecardsError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get all piecework records for period
  const { data: pieceworkRecords, error: pieceworkError } = await supabase
    .from("piecework_records")
    .select("*")
    .in("member_id", memberIds)
    .gte("created_at", period_start)
    .lte("created_at", `${period_end}T23:59:59`);

  if (pieceworkError) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch piecework records", details: pieceworkError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Aggregate by member
  const memberTotals: Record<string, any> = {};

  // Process timecards
  timecards?.forEach((tc) => {
    const memberId = tc.member_id;
    if (!memberTotals[memberId]) {
      memberTotals[memberId] = {
        member_id: memberId,
        total_hours: 0,
        regular_hours: 0,
        overtime_hours: 0,
        regular_pay: 0,
        overtime_pay: 0,
        piecework_pay: 0,
        total_pay: 0,
        jobs_worked: new Set<string>(),
      };
    }

    memberTotals[memberId].total_hours += Number(tc.total_hours || 0);
    memberTotals[memberId].regular_hours += Number(tc.total_hours || 0) - Number(tc.overtime_hours || 0);
    memberTotals[memberId].overtime_hours += Number(tc.overtime_hours || 0);
    memberTotals[memberId].regular_pay += Number(tc.regular_pay || 0);
    memberTotals[memberId].overtime_pay += Number(tc.overtime_pay || 0);
    memberTotals[memberId].total_pay += Number(tc.total_pay || 0);
    if (tc.job_id) {
      memberTotals[memberId].jobs_worked.add(tc.job_id);
    }
  });

  // Process piecework records
  pieceworkRecords?.forEach((pr) => {
    const memberId = pr.member_id;
    if (!memberTotals[memberId]) {
      memberTotals[memberId] = {
        member_id: memberId,
        total_hours: 0,
        regular_hours: 0,
        overtime_hours: 0,
        regular_pay: 0,
        overtime_pay: 0,
        piecework_pay: 0,
        total_pay: 0,
        jobs_worked: new Set<string>(),
      };
    }

    memberTotals[memberId].piecework_pay += Number(pr.total_pay || 0);
    memberTotals[memberId].total_pay += Number(pr.total_pay || 0);
    if (pr.job_id) {
      memberTotals[memberId].jobs_worked.add(pr.job_id);
    }
  });

  // Create payroll items
  const payrollItems = Object.values(memberTotals).map((totals: any) => ({
    payroll_id: payrollRun.id,
    member_id: totals.member_id,
    total_hours: totals.total_hours,
    regular_hours: totals.regular_hours,
    overtime_hours: totals.overtime_hours,
    regular_pay: totals.regular_pay,
    overtime_pay: totals.overtime_pay,
    piecework_pay: totals.piecework_pay,
    total_pay: totals.total_pay,
    jobs_worked: Array.from(totals.jobs_worked),
    status: "calculated",
  }));

  const { error: itemsError } = await supabase
    .from("payroll_items")
    .insert(payrollItems);

  if (itemsError) {
    return new Response(
      JSON.stringify({ error: "Failed to create payroll items", details: itemsError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Calculate totals
  const totalLaborCost = payrollItems.reduce((sum, item) => sum + Number(item.total_pay), 0);
  const totalHours = payrollItems.reduce((sum, item) => sum + Number(item.total_hours), 0);
  const totalOvertimeHours = payrollItems.reduce((sum, item) => sum + Number(item.overtime_hours), 0);
  const totalPieceworkPay = payrollItems.reduce((sum, item) => sum + Number(item.piecework_pay), 0);

  // Update payroll run with totals
  const { data: updatedRun, error: updateError } = await supabase
    .from("payroll_runs")
    .update({
      total_labor_cost: totalLaborCost,
      total_hours: totalHours,
      total_overtime_hours: totalOvertimeHours,
      total_piecework_pay: totalPieceworkPay,
      total_members: payrollItems.length,
      status: "processed",
    })
    .eq("id", payrollRun.id)
    .select()
    .single();

  if (updateError) {
    return new Response(
      JSON.stringify({ error: "Failed to update payroll run", details: updateError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      payroll_run: updatedRun,
      payroll_items: payrollItems,
      message: "Payroll run created successfully",
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * GET /payroll/forecast
 * Uses production calendar to predict labor cost
 */
async function handleForecast(req: Request) {
  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id");
  const weeks_ahead = parseInt(url.searchParams.get("weeks_ahead") || "2");

  if (!workspace_id) {
    return new Response(
      JSON.stringify({ error: "workspace_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get scheduled jobs from production calendar
  // This is a simplified version - adjust based on your production calendar structure
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + weeks_ahead * 7);

  // Get average labor cost per job (from historical data)
  const { data: historicalJobs, error: historicalError } = await supabase
    .from("timecards")
    .select("job_id, total_pay")
    .eq("status", "completed")
    .not("total_pay", "is", null)
    .limit(100);

  if (historicalError) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch historical data", details: historicalError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Calculate average labor cost per job
  const jobCosts = new Map<string, number>();
  historicalJobs?.forEach((tc) => {
    if (tc.job_id) {
      const current = jobCosts.get(tc.job_id) || 0;
      jobCosts.set(tc.job_id, current + Number(tc.total_pay || 0));
    }
  });

  const avgLaborCostPerJob =
    Array.from(jobCosts.values()).reduce((sum, cost) => sum + cost, 0) / (jobCosts.size || 1);

  // Get scheduled jobs count (placeholder - adjust based on your calendar structure)
  // For now, return a simple forecast
  const forecast = {
    weeks_ahead,
    start_date: startDate.toISOString().split("T")[0],
    end_date: endDate.toISOString().split("T")[0],
    estimated_jobs: 0, // Would come from production calendar
    estimated_labor_cost: 0, // Would be estimated_jobs * avgLaborCostPerJob
    average_labor_cost_per_job: avgLaborCostPerJob,
    message: "Forecast generated (simplified - integrate with production calendar)",
  };

  return new Response(JSON.stringify({ forecast }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
































