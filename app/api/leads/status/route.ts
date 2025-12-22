// Block 21728 — SmartSend Roofing Lead Status Brain v1
// API Route — Manual Status Change (Estimator)
// Allows estimators to manually change lead status

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lead_id, status } = await req.json();

    if (!lead_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: lead_id and status" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["hot", "warm", "cold", "new"];
    if (!validStatuses.includes(status.toLowerCase())) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const normalizedStatus = status.toLowerCase();

    // Verify lead exists and user has access
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, workspace_id, status")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", lead.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update lead status
    const { data, error } = await supabase
      .from("leads")
      .update({
        status: normalizedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update lead status:", error);
      return NextResponse.json(
        { error: "Failed to update lead status", details: error.message },
        { status: 500 }
      );
    }

    // Add timeline event
    const addEventUrl = process.env.ADD_LEAD_EVENT_URL;
    if (addEventUrl) {
      try {
        await fetch(addEventUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lead_id,
            event_type: "status_changed",
            event_subtype: "manual",
            message: `Estimator changed status to ${normalizedStatus.toUpperCase()}`,
            metadata: {
              old_status: lead.status,
              new_status: normalizedStatus,
              changed_by: user.id,
            },
          }),
        });
      } catch (eventErr) {
        console.error("Failed to log timeline event:", eventErr);
        // Fallback: insert directly
        await supabase.from("lead_timeline_events").insert({
          lead_id,
          event_type: "status_changed",
          event_subtype: "manual",
          message: `Estimator changed status to ${normalizedStatus.toUpperCase()}`,
          metadata: {
            old_status: lead.status,
            new_status: normalizedStatus,
            changed_by: user.id,
          },
        });
      }
    } else {
      // Fallback: insert directly if ADD_LEAD_EVENT_URL not set
      await supabase.from("lead_timeline_events").insert({
        lead_id,
        event_type: "status_changed",
        event_subtype: "manual",
        message: `Estimator changed status to ${normalizedStatus.toUpperCase()}`,
        metadata: {
          old_status: lead.status,
          new_status: normalizedStatus,
          changed_by: user.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      status: normalizedStatus,
      lead: data,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}










































