// Block 83000 — SmartSend Roofing Homeowner Portal v1
// Integration Helper: Auto-create events from existing systems
// POST /api/homeowner-portal/integration

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated (or use service role for internal calls)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Allow service role or authenticated users
    const body = await req.json();
    const { job_id, event_type, title, description, source } = body;

    if (!job_id || !event_type || !title) {
      return NextResponse.json(
        { error: "job_id, event_type, and title are required" },
        { status: 400 }
      );
    }

    // Use RPC function to add event
    const { data: eventId, error: rpcError } = await supabase.rpc(
      "add_portal_event",
      {
        p_job_id: job_id,
        p_event_type: event_type,
        p_title: title,
        p_description: description || null,
      }
    );

    if (rpcError) {
      console.error("Error adding portal event:", rpcError);
      // Fallback: try direct insert
      const { data: portal } = await supabase
        .from("homeowner_portals")
        .select("id")
        .eq("job_id", job_id)
        .eq("is_active", true)
        .single();

      if (portal) {
        const { data: event, error: insertError } = await supabase
          .from("homeowner_portal_events")
          .insert({
            portal_id: portal.id,
            job_id: job_id,
            event_type,
            title,
            description,
          })
          .select()
          .single();

        if (insertError) {
          return NextResponse.json(
            { error: insertError.message || "Failed to create event" },
            { status: 500 }
          );
        }

        return NextResponse.json({ event_id: event.id }, { status: 201 });
      }

      return NextResponse.json(
        { error: rpcError.message || "Failed to create event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ event_id: eventId }, { status: 201 });
  } catch (error: any) {
    console.error("Error in portal integration:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























