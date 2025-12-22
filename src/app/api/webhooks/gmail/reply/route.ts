import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { classifyReplyText } from "@/lib/ai/classifyReply";
import { applyReplyOutcome } from "@/lib/replies/routeActions";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { threadId, from, subject, snippet, body } = payload; // include full 'body' if you have it

    // Validate required fields
    if (!threadId || !from) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if thread exists in outbound_messages
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("outbound_messages")
      .select("id, owner, lead_id, sequence_id, message_id")
      .eq("message_id", threadId)
      .maybeSingle();

    if (!existing || lookupError) {
      console.log(`Thread not found for message_id: ${threadId}`);
      return NextResponse.json({ message: "Thread not found" }, { status: 404 });
    }

    // Classify the reply using AI
    const text = (body || snippet || "").toString();
    const { intent, confidence, summary, raw } = await classifyReplyText(text);

    // Apply AI-driven reply outcome
    await applyReplyOutcome({
      lead_id: existing.lead_id,
      email_log_id: existing.id,
      intent, confidence, summary, raw,
      from_email: typeof from === "string" ? from.match(/<([^>]+)>/)?.[1] || from : null
    });

    // Update outbound_messages with reply details
    const { error: updateError } = await supabaseAdmin
      .from("outbound_messages")
      .update({
        replied: true,
        reply_received_at: new Date().toISOString(),
        reply_message_id: threadId,
        reply_intent: intent,
        reply_confidence: confidence,
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Error updating outbound_messages:", updateError);
      return NextResponse.json(
        { error: "Failed to update outbound message" },
        { status: 500 }
      );
    }

    // Update lead's last_replied_at timestamp
    if (existing.lead_id) {
      await supabaseAdmin
        .from("leads")
        .update({ last_replied_at: new Date().toISOString() })
        .eq("id", existing.lead_id);
    }

    // Check if sequence should stop on reply
    if (existing.sequence_id) {
      const { data: sequence } = await supabaseAdmin
        .from("sequences")
        .select("stop_on_reply")
        .eq("id", existing.sequence_id)
        .maybeSingle();

      // Stop future sends in this sequence for this lead
      if (sequence?.stop_on_reply) {
        await supabaseAdmin
          .from("sequence_enrollments")
          .update({
            status: "completed",
            next_send_at: null,
            completed_at: new Date().toISOString(),
          })
          .eq("lead_id", existing.lead_id)
          .eq("sequence_id", existing.sequence_id)
          .eq("status", "active");
      }
    }

    // Log the reply event
    try {
      await supabaseAdmin
        .from("send_events")
        .insert({
          owner: existing.owner,
          lead_id: existing.lead_id,
          sequence_id: existing.sequence_id,
          kind: "replied",
        });
    } catch (eventError) {
      // Don't fail if event logging fails
      console.warn("Failed to log reply event:", eventError);
    }

    console.log(`📬 Reply detected from ${from} — ${subject} (${intent}, ${Math.round(confidence * 100)}%)`);
    return NextResponse.json({ success: true, intent, confidence, summary });
  } catch (err) {
    console.error("Gmail webhook error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
} 