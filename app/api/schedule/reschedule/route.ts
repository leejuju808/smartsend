// API Route: Reschedule a job
// POST /api/schedule/reschedule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { schedule_id, new_start_date, new_crew_id, reason, notify_homeowner } = body;

    if (!schedule_id || !new_start_date) {
      return NextResponse.json(
        { error: "schedule_id and new_start_date are required" },
        { status: 400 }
      );
    }

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/functions/v1/schedule-reschedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        schedule_id,
        new_start_date,
        new_crew_id,
        reason,
        notify_homeowner: notify_homeowner !== false, // Default true
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error rescheduling:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































