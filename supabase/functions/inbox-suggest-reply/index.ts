// Edge Function: inbox-suggest-reply
// Generates AI-suggested replies based on intent, thread history, and lead context

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

async function generateReply(
  message: string,
  intent: string,
  threadHistory: string,
  leadInfo: any
): Promise<string> {
  const leadName = leadInfo?.first_name || leadInfo?.name || "there";
  const leadEmail = leadInfo?.email || "";
  const leadPhone = leadInfo?.phone || "";

  const prompt = `You are a professional roofing company office assistant. Generate a short, friendly, professional reply to a homeowner message.

Homeowner message: "${message}"
Intent: ${intent}
Lead name: ${leadName}
Lead email: ${leadEmail}
Lead phone: ${leadPhone}

Recent conversation:
${threadHistory || "No previous messages."}

Guidelines:
- Keep it short (2-4 sentences max)
- Friendly and professional tone
- No emojis
- Direct and actionable
- Match the intent appropriately

For booking_request: Offer scheduling options or booking link.
For price_question: Acknowledge and offer to provide detailed estimate.
For leak_emergency: Express urgency, offer immediate assistance, ask for photos.
For ready_to_move_forward: Express excitement, mention next steps (contract, scheduling).
For send_proposal_again: Confirm you'll resend.
For warranty_claim: Acknowledge and offer to review warranty details.
For financing_question: Mention financing options available.
For complaint: Apologize sincerely and offer to resolve.
For schedule_change: Acknowledge and offer to reschedule.

Generate the reply now:`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional roofing company office assistant. Generate concise, helpful replies.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    console.error("OpenAI API error:", await response.text());
    return `Hi ${leadName},\n\nThank you for your message. We'll get back to you shortly.\n\nBest regards`;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || `Hi ${leadName},\n\nThank you for your message. We'll get back to you shortly.`;
}

Deno.serve(async (req) => {
  try {
    const { thread_id, message_id } = await req.json();

    if (!thread_id && !message_id) {
      return new Response(
        JSON.stringify({ error: "thread_id or message_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get thread with latest message
    let query = supabase
      .from("inbox_threads")
      .select(`
        id,
        lead_id,
        last_intent,
        inbox_messages (
          id,
          content,
          direction,
          intent,
          created_at
        )
      `)
      .order("inbox_messages.created_at", { ascending: false }, { foreignTable: "inbox_messages" });

    if (thread_id) {
      query = query.eq("id", thread_id);
    } else {
      // Get thread from message
      const { data: msg } = await supabase
        .from("inbox_messages")
        .select("thread_id")
        .eq("id", message_id)
        .single();
      if (!msg) {
        return new Response(
          JSON.stringify({ error: "Message not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      query = query.eq("id", msg.thread_id);
    }

    const { data: thread, error: threadError } = await query.single();

    if (threadError || !thread) {
      return new Response(
        JSON.stringify({ error: "Thread not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead info
    const { data: lead } = await supabase
      .from("leads")
      .select("id, first_name, last_name, name, email, phone")
      .eq("id", thread.lead_id)
      .single();

    // Get latest inbound message
    const messages = thread.inbox_messages || [];
    const latestMessage = messages.find((m: any) => m.direction === "inbound");
    
    if (!latestMessage) {
      return new Response(
        JSON.stringify({ error: "No inbound messages found in thread" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build thread history (last 3 messages for context)
    const recentMessages = messages
      .slice(0, 3)
      .map((m: any) => `${m.direction}: ${m.content.substring(0, 100)}`)
      .join("\n");

    // Generate reply
    const reply = await generateReply(
      latestMessage.content,
      latestMessage.intent || thread.last_intent || "unknown",
      recentMessages,
      lead
    );

    return new Response(
      JSON.stringify({
        ok: true,
        reply,
        intent: latestMessage.intent || thread.last_intent,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in inbox-suggest-reply:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































