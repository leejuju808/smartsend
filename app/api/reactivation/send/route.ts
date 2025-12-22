// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// API Route: Send Reactivation Message
// POST /api/reactivation/send

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { event_id, workspace_id } = body;

    if (!event_id || !workspace_id) {
      return NextResponse.json(
        { error: "event_id and workspace_id are required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from("reactivation_events")
      .select(`
        *,
        past_customers:past_customer_id (
          id,
          homeowner_name,
          email,
          phone
        )
      `)
      .eq("id", event_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Reactivation event not found" },
        { status: 404 }
      );
    }

    // Call edge function to send message
    const { data: sendResult, error: sendError } = await supabase.functions.invoke(
      "send-reactivation-message",
      {
        body: {
          event_id: event_id,
          phone: event.past_customers?.phone,
          email: event.past_customers?.email,
          name: event.past_customers?.homeowner_name,
          type: event.type,
        },
      }
    );

    if (sendError) {
      console.error("Error sending reactivation message:", sendError);
      return NextResponse.json(
        { error: "Failed to send reactivation message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: sendResult,
      message: "Reactivation message sent successfully",
    });
  } catch (error) {
    console.error("Error in reactivation send API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































