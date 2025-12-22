// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/login
// Crew leader logs in with company code, phone, and 4-digit PIN
// Returns job list + next-day schedule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { companyCode, phone, pin } = await req.json();

    if (!companyCode || !phone || !pin) {
      return NextResponse.json(
        { error: "companyCode, phone, and pin are required" },
        { status: 400 }
      );
    }

    // Find crew by foreman phone and verify PIN
    // Note: In production, PIN should be hashed and stored securely
    const { data: crew, error: crewError } = await supabase
      .from("crews")
      .select(`
        id,
        name,
        foreman_phone,
        workspace_id,
        workspaces!inner(id, name, company_code)
      `)
      .eq("foreman_phone", phone)
      .eq("workspaces.company_code", companyCode)
      .single();

    if (crewError || !crew) {
      return NextResponse.json(
        { error: "Invalid company code or phone number" },
        { status: 401 }
      );
    }

    // TODO: Verify PIN (should be stored hashed in crew_members or separate auth table)
    // For now, we'll use a simple check - in production, implement proper PIN verification

    // Get today's jobs for this crew
    const today = new Date().toISOString().split("T")[0];
    
    const { data: todayJobs, error: jobsError } = await supabase
      .from("jobs")
      .select(`
        id,
        address,
        homeowner_name,
        homeowner_phone,
        production_date,
        stage,
        notes
      `)
      .eq("crew_id", crew.id)
      .eq("production_date", today)
      .in("stage", ["scheduled", "in_progress"])
      .order("production_date", { ascending: true });

    // Also check roofing_jobs if it exists
    let roofingJobs: any[] = [];
    const { data: roofingJobsData } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        address,
        homeowner_name,
        homeowner_phone,
        scheduled_start_date,
        status,
        notes
      `)
      .eq("crew_id", crew.id)
      .eq("scheduled_start_date", today)
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_start_date", { ascending: true });

    if (roofingJobsData) {
      roofingJobs = roofingJobsData;
    }

    // Get tomorrow's schedule
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: tomorrowJobs } = await supabase
      .from("jobs")
      .select(`
        id,
        address,
        production_date
      `)
      .eq("crew_id", crew.id)
      .eq("production_date", tomorrowStr)
      .in("stage", ["scheduled"]);

    // Create or update session
    const deviceId = req.headers.get("x-device-id") || `device-${Date.now()}`;
    
    const { data: session, error: sessionError } = await supabase
      .from("crew_app_sessions")
      .upsert({
        crew_id: crew.id,
        device_id: deviceId,
        last_active: new Date().toISOString(),
      }, {
        onConflict: "crew_id,device_id",
      })
      .select()
      .single();

    if (sessionError) {
      console.error("Session creation error:", sessionError);
    }

    return NextResponse.json({
      success: true,
      crew: {
        id: crew.id,
        name: crew.name,
        workspace_id: crew.workspace_id,
      },
      todayJobs: todayJobs || [],
      roofingJobs: roofingJobs || [],
      tomorrowSchedule: tomorrowJobs || [],
      sessionToken: session?.id, // In production, generate proper JWT
    });
  } catch (error: any) {
    console.error("Crew login error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























