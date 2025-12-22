// Block 34044 — Install Day Timeline API
// GET: Get timeline milestones
// POST: Add timeline milestone

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

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

    const { data: timeline, error } = await supabase
      .from("install_day_timeline")
      .select(`
        *,
        crews (
          id,
          name
        )
      `)
      .eq("job_id", params.id)
      .order("milestone_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ timeline: timeline || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

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
      milestone,
      notes,
      progress_percent,
    } = body;

    if (!milestone) {
      return NextResponse.json(
        { error: "milestone is required" },
        { status: 400 }
      );
    }

    const validMilestones = [
      'crew_arrival',
      'tear_off_start',
      'tear_off_complete',
      'underlayment_start',
      'underlayment_complete',
      'shingling_start',
      'shingling_complete',
      'cleanup_start',
      'cleanup_complete',
      'job_complete',
    ];

    if (!validMilestones.includes(milestone)) {
      return NextResponse.json(
        { error: `Invalid milestone. Must be one of: ${validMilestones.join(', ')}` },
        { status: 400 }
      );
    }

    // Create timeline entry
    const { data: timelineEntry, error } = await supabase
      .from("install_day_timeline")
      .insert({
        job_id: params.id,
        crew_id,
        milestone,
        notes,
        progress_percent,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Trigger homeowner update based on milestone
    let updateType: string | null = null;
    let message = "";

    switch (milestone) {
      case 'crew_arrival':
        updateType = 'crew_arrived';
        message = "Your roofing crew has arrived and is beginning work.";
        break;
      case 'tear_off_start':
        updateType = 'tear_off_started';
        message = "Roof tear-off has begun.";
        break;
      case 'underlayment_start':
        updateType = 'underlayment_installing';
        message = "Installing underlayment.";
        break;
      case 'shingling_start':
        updateType = 'shingling_underway';
        message = "Shingling now underway.";
        break;
      case 'cleanup_start':
        updateType = 'cleanup_in_progress';
        message = "Cleanup in progress.";
        break;
      case 'job_complete':
        updateType = 'installation_complete';
        message = "Your roof installation is complete!";
        break;
    }

    if (updateType && message) {
      await supabase.from("homeowner_updates").insert({
        job_id: params.id,
        update_type: updateType,
        message_sent: message,
        sent_via: "sms",
      });
    }

    return NextResponse.json({ timeline_entry: timelineEntry }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































