import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/inbox/calendar/appointments
 * Fetch appointments for calendar view with date range and rep filter
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const repId = searchParams.get("rep_id");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end date parameters are required" },
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

    // Build query
    let query = supabase
      .from("appointments")
      .select(`
        id,
        contact_id,
        thread_id,
        job_id,
        date,
        time,
        start_time,
        end_time,
        duration_minutes,
        appointment_type_id,
        assigned_rep_id,
        address,
        location_address,
        job_type,
        priority,
        status,
        notes,
        storm_related,
        created_at,
        updated_at,
        appointment_types (
          id,
          name,
          color,
          icon
        ),
        contacts (
          id,
          name,
          phone,
          email
        ),
        assigned_rep:profiles!appointments_assigned_rep_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq("workspace_id", workspaceMember.workspace_id)
      .gte("start_time", start)
      .lte("end_time", end)
      .in("status", ["scheduled", "confirmed"]);

    // Filter by rep if specified
    if (repId && repId !== "all") {
      query = query.eq("assigned_rep_id", repId);
    }

    const { data: appointments, error } = await query.order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json(
        { error: "Failed to fetch appointments", details: error.message },
        { status: 500 }
      );
    }

    // Transform appointments to include nested data
    const transformedAppointments = (appointments || []).map((apt: any) => ({
      id: apt.id,
      contact_id: apt.contact_id,
      thread_id: apt.thread_id,
      job_id: apt.job_id,
      date: apt.date,
      time: apt.time,
      start_time: apt.start_time,
      end_time: apt.end_time,
      duration_minutes: apt.duration_minutes,
      appointment_type_id: apt.appointment_type_id,
      appointment_type_name: apt.appointment_types?.name || null,
      appointment_type_color: apt.appointment_types?.color || null,
      appointment_type_icon: apt.appointment_types?.icon || null,
      assigned_rep_id: apt.assigned_rep_id,
      assigned_rep_name: apt.assigned_rep?.full_name || apt.assigned_rep?.email || null,
      contact_name: apt.contacts?.name || "Unknown",
      contact_phone: apt.contacts?.phone || null,
      contact_email: apt.contacts?.email || null,
      address: apt.address || apt.location_address || null,
      job_type: apt.job_type,
      priority: apt.priority || "normal",
      status: apt.status,
      notes: apt.notes,
      storm_related: apt.storm_related || false,
      location_address: apt.location_address || apt.address || null,
    }));

    return NextResponse.json({ appointments: transformedAppointments });
  } catch (error: any) {
    console.error("Error in calendar appointments route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































