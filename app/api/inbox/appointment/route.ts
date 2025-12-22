// Block 20220 — Appointment Scheduler API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      conversation_id,
      appointment_type,
      appointment_at,
      appointment_status,
      appointment_notes,
      appointment_address_override,
    } = body;

    if (!conversation_id || !appointment_type || !appointment_at) {
      return NextResponse.json(
        { error: "conversation_id, appointment_type, appointment_at required" },
        { status: 400 }
      );
    }

    // 1) Load current thread to get campaign_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("id", conversation_id)
      .single();

    if (threadError || !thread) {
      console.error("Appointment thread error", threadError);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Update conversation with appointment data
    const updatePayload: any = {
      appointment_type,
      appointment_at,
      appointment_status: appointment_status || "scheduled",
      appointment_notes: appointment_notes || null,
      appointment_address_override: appointment_address_override || null,
      next_action_at: appointment_at, // auto follow-up
    };

    const { data: updatedThread, error: updateError } = await supabase
      .from("inbox_threads")
      .update(updatePayload)
      .eq("id", conversation_id)
      .select()
      .single();

    if (updateError) {
      console.error("Appointment update error", updateError);
      return NextResponse.json(
        { error: "Failed to update conversation" },
        { status: 500 }
      );
    }

    // 3) Log into activity timeline
    const { error: logError } = await supabase.from("inbox_activity_log").insert({
      thread_id: conversation_id,
      campaign_id: thread.campaign_id,
      user_id: user.id,
      type: "appointment",
      title: `Appointment scheduled: ${appointment_type}`,
      body: appointment_notes || null,
      meta: {
        appointment_type,
        appointment_at,
        appointment_status: appointment_status || "scheduled",
        appointment_address_override: appointment_address_override || null,
      },
    });

    if (logError) {
      console.error("Appointment activity error", logError);
      // not fatal for API consumer
    }

    // NEW — bump engagement
    await supabase.rpc("fn_update_conversation_engagement", {
      p_conversation_id: conversation_id,
    });

    return NextResponse.json({ conversation: updatedThread });
  } catch (error: any) {
    console.error("Error in appointment route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

