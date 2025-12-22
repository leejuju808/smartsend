import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Block 55000 — SmartSend Roofing Vehicle Fleet Tracking Edge Functions
 * 
 * Routes:
 * - POST /vehicles/assign - Assign vehicle to crew
 * - POST /vehicles/log-mileage - Log mileage and check maintenance
 * - POST /vehicles/report-damage - Report vehicle damage
 * - POST /vehicles/log-fuel - Log fuel purchase
 * - GET /vehicles/maintenance-scan - Scan for overdue maintenance
 * - GET /vehicles/status - Get vehicle status
 * - POST /vehicles/pre-trip-checklist - Submit pre-trip checklist
 */

interface VehicleAssignRequest {
  vehicle_id: string;
  crew_id?: string;
  crew_member_id?: string;
  notes?: string;
}

interface LogMileageRequest {
  vehicle_id: string;
  mileage: number;
  log_type?: "daily" | "job_start" | "job_end" | "weekly";
  job_id?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  notes?: string;
}

interface ReportDamageRequest {
  vehicle_id: string;
  description: string;
  severity: "minor" | "moderate" | "major" | "totaled";
  photos?: string[];
  job_id?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  driver_name?: string;
  other_party_info?: Record<string, any>;
}

interface LogFuelRequest {
  vehicle_id: string;
  gallons: number;
  cost: number;
  receipt_photo?: string;
  job_id?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  station_name?: string;
  odometer_reading?: number;
}

interface PreTripChecklistRequest {
  vehicle_id: string;
  tires_inflated: boolean;
  oil_level_ok: boolean;
  no_warning_lights: boolean;
  trailer_lights_working: boolean;
  ladder_racks_secured: boolean;
  no_visible_damage: boolean;
  issues_notes?: string;
  job_id?: string;
  latitude?: number;
  longitude?: number;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/vehicles", "");

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Route based on path
    if (path === "/assign" && req.method === "POST") {
      return await handleAssign(req, user.id);
    } else if (path === "/log-mileage" && req.method === "POST") {
      return await handleLogMileage(req, user.id);
    } else if (path === "/report-damage" && req.method === "POST") {
      return await handleReportDamage(req, user.id);
    } else if (path === "/log-fuel" && req.method === "POST") {
      return await handleLogFuel(req, user.id);
    } else if (path === "/maintenance-scan" && req.method === "GET") {
      return await handleMaintenanceScan(req);
    } else if (path === "/status" && req.method === "GET") {
      return await handleStatus(req);
    } else if (path === "/pre-trip-checklist" && req.method === "POST") {
      return await handlePreTripChecklist(req, user.id);
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
 * POST /vehicles/assign
 * Assign vehicle to crew or crew member
 */
async function handleAssign(req: Request, userId: string) {
  const body: VehicleAssignRequest = await req.json();
  const { vehicle_id, crew_id, crew_member_id, notes } = body;

  if (!vehicle_id) {
    return new Response(
      JSON.stringify({ error: "vehicle_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!crew_id && !crew_member_id) {
    return new Response(
      JSON.stringify({ error: "Either crew_id or crew_member_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get vehicle to verify workspace access
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("workspace_id, assigned_crew_id, assigned_supervisor_id")
    .eq("id", vehicle_id)
    .single();

  if (vehicleError || !vehicle) {
    return new Response(
      JSON.stringify({ error: "Vehicle not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify user has access to workspace
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", vehicle.workspace_id)
    .eq("user_id", userId)
    .single();

  if (!member) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Unassign previous assignment if exists
  await supabase
    .from("vehicle_assignments")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("vehicle_id", vehicle_id)
    .is("unassigned_at", null);

  // Create new assignment
  const { data: assignment, error: assignError } = await supabase
    .from("vehicle_assignments")
    .insert({
      vehicle_id,
      crew_id: crew_id || null,
      crew_member_id: crew_member_id || null,
      assigned_by: userId,
      notes,
    })
    .select()
    .single();

  if (assignError) {
    return new Response(
      JSON.stringify({ error: assignError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Update vehicle assignment
  const updateData: any = { status: "in_use" };
  if (crew_id) updateData.assigned_crew_id = crew_id;
  if (crew_member_id) updateData.assigned_supervisor_id = crew_member_id;

  await supabase
    .from("vehicles")
    .update(updateData)
    .eq("id", vehicle_id);

  return new Response(
    JSON.stringify({ success: true, assignment }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * POST /vehicles/log-mileage
 * Log mileage and check if maintenance is due
 */
async function handleLogMileage(req: Request, userId: string) {
  const body: LogMileageRequest = await req.json();
  const { vehicle_id, mileage, log_type = "daily", job_id, latitude, longitude, address, notes } = body;

  if (!vehicle_id || mileage === undefined) {
    return new Response(
      JSON.stringify({ error: "vehicle_id and mileage are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get crew member ID from user
  const { data: crewMember } = await supabase
    .from("crew_members")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  // Create mileage log
  const { data: mileageLog, error: logError } = await supabase
    .from("vehicle_mileage_logs")
    .insert({
      vehicle_id,
      crew_member_id: crewMember?.id || null,
      job_id: job_id || null,
      mileage,
      log_type,
      latitude: latitude || null,
      longitude: longitude || null,
      address: address || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (logError) {
    return new Response(
      JSON.stringify({ error: logError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for maintenance due
  const { data: maintenanceDue } = await supabase.rpc("check_maintenance_due");

  const vehicleMaintenance = maintenanceDue?.filter((m: any) => m.vehicle_id === vehicle_id) || [];

  return new Response(
    JSON.stringify({ 
      success: true, 
      mileage_log: mileageLog,
      maintenance_due: vehicleMaintenance
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * POST /vehicles/report-damage
 * Report vehicle damage with photos
 */
async function handleReportDamage(req: Request, userId: string) {
  const body: ReportDamageRequest = await req.json();
  const { vehicle_id, description, severity, photos = [], job_id, latitude, longitude, address, driver_name, other_party_info } = body;

  if (!vehicle_id || !description || !severity) {
    return new Response(
      JSON.stringify({ error: "vehicle_id, description, and severity are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get crew member ID
  const { data: crewMember } = await supabase
    .from("crew_members")
    .select("id, name")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  // Create damage report
  const { data: damageReport, error: reportError } = await supabase
    .from("vehicle_damage_reports")
    .insert({
      vehicle_id,
      crew_member_id: crewMember?.id || null,
      job_id: job_id || null,
      description,
      severity,
      photos,
      latitude: latitude || null,
      longitude: longitude || null,
      address: address || null,
      driver_name: driver_name || crewMember?.name || null,
      other_party_info: other_party_info || {},
    })
    .select()
    .single();

  if (reportError) {
    return new Response(
      JSON.stringify({ error: reportError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Update vehicle status if major damage
  if (severity === "major" || severity === "totaled") {
    await supabase
      .from("vehicles")
      .update({ status: "out_of_service" })
      .eq("id", vehicle_id);
  }

  return new Response(
    JSON.stringify({ success: true, damage_report: damageReport }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * POST /vehicles/log-fuel
 * Log fuel purchase and calculate efficiency
 */
async function handleLogFuel(req: Request, userId: string) {
  const body: LogFuelRequest = await req.json();
  const { vehicle_id, gallons, cost, receipt_photo, job_id, latitude, longitude, address, station_name, odometer_reading } = body;

  if (!vehicle_id || gallons === undefined || cost === undefined) {
    return new Response(
      JSON.stringify({ error: "vehicle_id, gallons, and cost are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get crew member ID
  const { data: crewMember } = await supabase
    .from("crew_members")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  // Create fuel log
  const { data: fuelLog, error: logError } = await supabase
    .from("vehicle_fuel_logs")
    .insert({
      vehicle_id,
      crew_member_id: crewMember?.id || null,
      job_id: job_id || null,
      gallons,
      cost,
      receipt_photo: receipt_photo || null,
      latitude: latitude || null,
      longitude: longitude || null,
      address: address || null,
      station_name: station_name || null,
      odometer_reading: odometer_reading || null,
    })
    .select()
    .single();

  if (logError) {
    return new Response(
      JSON.stringify({ error: logError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Calculate MPG if odometer reading provided
  let mpgData = null;
  if (odometer_reading) {
    const { data: mpg } = await supabase.rpc("calculate_vehicle_mpg", {
      p_vehicle_id: vehicle_id,
      p_days: 30,
    });
    mpgData = mpg?.[0] || null;
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      fuel_log: fuelLog,
      efficiency: mpgData
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * GET /vehicles/maintenance-scan
 * Scan for overdue maintenance across all vehicles
 */
async function handleMaintenanceScan(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");

  if (!workspaceId) {
    return new Response(
      JSON.stringify({ error: "workspace_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get all maintenance due
  const { data: maintenanceDue, error } = await supabase.rpc("check_maintenance_due");

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Filter by workspace
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id")
    .eq("workspace_id", workspaceId);

  const vehicleIds = vehicles?.map(v => v.id) || [];
  const filteredMaintenance = maintenanceDue?.filter((m: any) => 
    vehicleIds.includes(m.vehicle_id)
  ) || [];

  return new Response(
    JSON.stringify({ maintenance_due: filteredMaintenance }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * GET /vehicles/status
 * Get real-time vehicle status (active, idle, maintenance)
 */
async function handleStatus(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  const vehicleId = url.searchParams.get("vehicle_id");

  if (!workspaceId && !vehicleId) {
    return new Response(
      JSON.stringify({ error: "Either workspace_id or vehicle_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let query = supabase
    .from("vehicles")
    .select(`
      id,
      name,
      status,
      current_mileage,
      assigned_crew_id,
      assigned_supervisor_id,
      crews:assigned_crew_id(name),
      registration_expiration
    `);

  if (vehicleId) {
    query = query.eq("id", vehicleId);
  } else if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data: vehicles, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ vehicles }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * POST /vehicles/pre-trip-checklist
 * Submit pre-trip safety checklist
 */
async function handlePreTripChecklist(req: Request, userId: string) {
  const body: PreTripChecklistRequest = await req.json();
  const { 
    vehicle_id, 
    tires_inflated, 
    oil_level_ok, 
    no_warning_lights, 
    trailer_lights_working, 
    ladder_racks_secured, 
    no_visible_damage,
    issues_notes,
    job_id,
    latitude,
    longitude
  } = body;

  if (!vehicle_id) {
    return new Response(
      JSON.stringify({ error: "vehicle_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get crew member ID
  const { data: crewMember } = await supabase
    .from("crew_members")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  // Determine if passed (all checks must be true)
  const passed = tires_inflated && oil_level_ok && no_warning_lights && 
                 trailer_lights_working && ladder_racks_secured && no_visible_damage;

  // Create checklist
  const { data: checklist, error: checklistError } = await supabase
    .from("vehicle_pre_trip_checklists")
    .insert({
      vehicle_id,
      crew_member_id: crewMember?.id || null,
      job_id: job_id || null,
      tires_inflated,
      oil_level_ok,
      no_warning_lights,
      trailer_lights_working,
      ladder_racks_secured,
      no_visible_damage,
      passed,
      issues_notes: issues_notes || null,
      latitude: latitude || null,
      longitude: longitude || null,
    })
    .select()
    .single();

  if (checklistError) {
    return new Response(
      JSON.stringify({ error: checklistError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      checklist,
      passed,
      message: passed 
        ? "Pre-trip checklist passed" 
        : "Pre-trip checklist failed - please address issues before using vehicle"
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
































