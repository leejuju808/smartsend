/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * API Endpoint: Generate Auto-Booking Suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, messageId } = body;

    if (!threadId || !messageId) {
      return NextResponse.json(
        { error: "threadId and messageId are required" },
        { status: 400 }
      );
    }

    // Get message and thread context
    const { data: message } = await supabase
      .from("inbox_messages")
      .select("*, campaign_id, lead_id")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Check if intent is scheduling-related
    if (!["inspection_scheduling", "hot_lead", "appointment_confirmed"].includes(message.ai_intent_label)) {
      return NextResponse.json(
        { error: "Message intent does not require booking suggestions" },
        { status: 400 }
      );
    }

    // TODO: Integrate with calendar system to get actual availability
    // For now, generate suggested times based on common availability patterns
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0); // 2 PM

    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(10, 0, 0, 0); // 10 AM

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(14, 0, 0, 0); // 2 PM

    const suggestedTimes = [
      {
        time: tomorrow.toISOString(),
        label: `Tomorrow ${tomorrow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - 4 PM`
      },
      {
        time: dayAfter.toISOString(),
        label: `${dayAfter.toLocaleDateString("en-US", { weekday: "long" })} ${dayAfter.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - 12 PM`
      },
      {
        time: nextWeek.toISOString(),
        label: `Next week ${nextWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${nextWeek.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - 4 PM`
      }
    ];

    // Create or update booking suggestion
    const { data: existingSuggestion } = await supabase
      .from("inbox_booking_suggestions")
      .select("id")
      .eq("thread_id", threadId)
      .eq("message_id", messageId)
      .eq("status", "pending")
      .single();

    let suggestionId;
    if (existingSuggestion) {
      const { data: updated } = await supabase
        .from("inbox_booking_suggestions")
        .update({
          suggested_times: suggestedTimes,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        })
        .eq("id", existingSuggestion.id)
        .select()
        .single();
      
      suggestionId = updated?.id;
    } else {
      const { data: created } = await supabase
        .from("inbox_booking_suggestions")
        .insert({
          thread_id: threadId,
          message_id: messageId,
          campaign_id: message.campaign_id,
          lead_id: message.lead_id,
          suggested_times: suggestedTimes,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();
      
      suggestionId = created?.id;
    }

    return NextResponse.json({
      suggestionId,
      suggestedTimes,
      message: "Booking suggestions generated successfully"
    });

  } catch (error) {
    console.error("Error generating booking suggestions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate booking suggestions" },
      { status: 500 }
    );
  }
}

/**
 * Book an appointment from a suggestion
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { suggestionId, bookedTime } = body;

    if (!suggestionId || !bookedTime) {
      return NextResponse.json(
        { error: "suggestionId and bookedTime are required" },
        { status: 400 }
      );
    }

    // Update booking suggestion
    const { data: suggestion, error: updateError } = await supabase
      .from("inbox_booking_suggestions")
      .update({
        status: "booked",
        booked_time: bookedTime,
        booked_by: user.id
      })
      .eq("id", suggestionId)
      .select("*, thread_id, lead_id, campaign_id")
      .single();

    if (updateError || !suggestion) {
      return NextResponse.json(
        { error: "Failed to book appointment" },
        { status: 500 }
      );
    }

    // TODO: Create calendar event
    // TODO: Send confirmation message to homeowner
    // TODO: Update lead status

    return NextResponse.json({
      success: true,
      suggestion,
      message: "Appointment booked successfully"
    });

  } catch (error) {
    console.error("Error booking appointment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to book appointment" },
      { status: 500 }
    );
  }
}






































