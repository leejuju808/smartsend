// app/api/inbox/reply/suggest/route.ts
// Block 10900 — Generate auto-suggested reply for contractor-style responses
// POST /api/inbox/reply/suggest - Generate AI-suggested reply

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { thread_id, homeowner_message } = body;

    if (!thread_id) {
      return NextResponse.json(
        { error: "Missing thread_id" },
        { status: 400 }
      );
    }

    // Get thread with lead and campaign info
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select(
        `
        id,
        lead_id,
        campaign_id,
        latest_intent,
        leads (
          id,
          email,
          name,
          first_name,
          last_name
        ),
        campaigns (
          id,
          name
        )
      `
      )
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const lead = thread.leads as any;
    const leadName =
      lead?.first_name ||
      lead?.name?.split(" ")[0] ||
      "there";

    // Get latest inbound message if homeowner_message not provided
    let messageText = homeowner_message;
    if (!messageText) {
      const { data: messages } = await supabase
        .from("inbound_messages")
        .select("text_body, snippet")
        .eq("thread_id", thread_id)
        .order("received_at", { ascending: false })
        .limit(1)
        .single();

      messageText = messages?.text_body || messages?.snippet || "";
    }

    const intent = thread.latest_intent || "unclassified";

    // Generate contractor-style reply
    const systemPrompt = `You are a roofing contractor's assistant writing a reply to a homeowner.

Your job: Write a short, direct, contractor-style response that:
- Gets straight to the point (no fluff)
- Uses blue-collar, friendly but professional tone
- Focuses on booking an appointment or answering their question
- Is 2-4 sentences max
- Sounds like a real contractor, not a salesperson

Rules:
- If they're asking for an estimate → offer to come look
- If they're asking about timing → give a clear answer
- If they're asking questions → answer directly
- Keep it conversational but professional
- Use their first name if available
- End with a clear next step`;

    const userPrompt = `Homeowner name: ${leadName}
Homeowner message: "${messageText}"
Intent: ${intent}

Write a contractor-style reply. Keep it short and direct.`;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const suggestedReply =
      completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json(
      {
        suggested_reply: suggestedReply,
        thread_id,
        intent,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Reply suggestion error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}























































