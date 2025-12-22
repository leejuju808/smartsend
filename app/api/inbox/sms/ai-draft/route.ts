// API endpoint for generating AI SMS drafts
// POST /api/inbox/sms/ai-draft
// Generates short, texting-optimized AI drafts for SMS replies

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { thread_id, intent } = await req.json();

    if (!thread_id) {
      return NextResponse.json(
        { error: "Missing thread_id" },
        { status: 400 }
      );
    }

    // Get thread context
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("id, contact_id, campaign_id, ai_overall_intent")
      .eq("id", thread_id)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get recent messages in thread
    const { data: messages } = await supabase
      .from("inbox_messages")
      .select("id, channel, body_raw, from_phone, to_phone, received_at, direction")
      .eq("thread_id", thread_id)
      .order("received_at", { ascending: false })
      .limit(10);

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages found in thread" },
        { status: 404 }
      );
    }

    // Get contact info
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone")
      .eq("id", thread.contact_id)
      .single();

    // Get campaign context
    let campaignContext = null;
    if (thread.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("id", thread.campaign_id)
        .single();
      campaignContext = campaign;
    }

    // Build conversation context
    const conversationHistory = messages
      .reverse()
      .map((msg) => {
        const isInbound = msg.from_phone && msg.from_phone !== contact?.phone;
        return `${isInbound ? "Homeowner" : "You"}: ${msg.body_raw}`;
      })
      .join("\n");

    // Determine intent
    const detectedIntent = intent || thread.ai_overall_intent || "warm";

    // Build SMS-optimized prompt
    const systemPrompt = `You are a roofing company SMS assistant. Write SHORT, DIRECT, HUMAN-SOUNDING text messages.

Rules:
- Keep it under 160 characters when possible
- No paragraphs, just short sentences
- Be friendly but direct
- Use contractions (we'll, can't, etc.)
- No formal sign-offs
- Get to the point fast

Intent: ${detectedIntent}`;

    const userPrompt = `Context: ${campaignContext?.name || "Roofing inquiry"}
Contact: ${contact?.first_name || "Homeowner"}

Recent conversation:
${conversationHistory}

Generate a short SMS reply that:
- Responds to their last message
- Is appropriate for the intent: ${detectedIntent}
- Keeps the conversation moving forward
- Sounds natural and human

SMS reply (keep it SHORT):`;

    // Generate draft
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 150, // Keep it short for SMS
    });

    const draft = completion.choices[0]?.message?.content?.trim() || "";

    if (!draft) {
      return NextResponse.json(
        { error: "Failed to generate draft" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      draft,
      intent: detectedIntent,
    });
  } catch (error: any) {
    console.error("Error generating SMS draft:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































