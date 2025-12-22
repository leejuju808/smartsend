// Block 34044 — Crew Check-In API
// POST: Record crew check-in status

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      crew_id,
      status,
      notes,
      location_lat,
      location_lng,
    } = body;

    if (!crew_id || !status) {
      return NextResponse.json(
        { error: "crew_id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ['on_the_way', 'arrived', 'in_progress', 'lunch', 'completed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, lead_id")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create check-in
    const { data: checkin, error } = await supabase
      .from("crew_checkins")
      .insert({
        job_id: params.id,
        crew_id,
        status,
        notes,
        location_lat,
        location_lng,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // If status is "arrived", trigger homeowner update
    if (status === 'arrived') {
      const { data: lead } = await supabase
        .from("leads")
        .select("phone, first_name, last_name")
        .eq("id", job.lead_id)
        .single();

      if (lead?.phone) {
        // This will be handled by the trigger, but we can also send update here
        // For now, just log it
        await supabase.from("homeowner_updates").insert({
          job_id: params.id,
          update_type: "crew_arrived",
          message_sent: "Your roofing crew has arrived and is beginning work.",
          sent_via: "sms",
        });
      }
    }

    // If status is "completed", update timeline
    if (status === 'completed') {
      await supabase.from("install_day_timeline").insert({
        job_id: params.id,
        crew_id,
        milestone: "job_complete",
        progress_percent: 100,
      });
    }

    return NextResponse.json({ checkin }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: checkins, error } = await supabase
      .from("crew_checkins")
      .select(`
        *,
        crews (
          id,
          name,
          leader_phone
        )
      `)
      .eq("job_id", params.id)
      .order("checked_in_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ checkins: checkins || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































