import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(
  req: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get thread with lead info
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select(`
        id,
        subject,
        intent_primary,
        lead_id,
        campaign_id,
        workspace_id
      `)
      .eq("id", params.threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("first_name, last_name, company, title, email")
      .eq("id", thread.lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Get messages from thread - try reply_messages first, then fallback to messages
    let messages: any[] = [];
    const { data: replyMessages } = await supabase
      .from("reply_messages")
      .select("body, direction, created_at")
      .eq("thread_id", params.threadId)
      .order("created_at", { ascending: true });

    if (replyMessages && replyMessages.length > 0) {
      messages = replyMessages;
    } else {
      // Fallback to messages table
      const { data: msgData } = await supabase
        .from("messages")
        .select("body_text, body_html, direction, created_at")
        .eq("thread_id", params.threadId)
        .order("created_at", { ascending: true });
      
      if (msgData) {
        messages = msgData.map((m: any) => ({
          body: m.body_html || m.body_text || "",
          direction: m.direction,
          created_at: m.created_at,
        }));
      }
    }

    const lastMessage = messages[messages.length - 1];
    const lastInboundMessage = messages
      .filter((m: any) => m.direction === "inbound" || m.direction === "in")
      .slice(-1)[0];

    const system = `You are SmartSend's reply assistant.
Goal: draft concise, human-sounding replies for B2B cold email.

Rules:
- Use clear, simple language.
- Match the prospect's tone (formal vs casual) but stay professional.
- Keep it short (3–7 sentences) unless they requested lots of details.
- If they show meeting intent, suggest concrete time options.
- If they are not interested, gracefully close the thread.
- Never invent pricing or links; refer to "{{pricing_page}}" / "{{booking_link}}" placeholders if needed.`;

    const prompt = `Lead:
- Name: ${lead.first_name || ""} ${lead.last_name || ""}
- Company: ${lead.company || ""}
- Title: ${lead.title || ""}
- Email: ${lead.email || ""}

Thread Subject: ${thread.subject || "(no subject)"}
Detected Intent: ${thread.intent_primary || "unknown"}

Last message from lead:
"${lastInboundMessage?.body || lastMessage?.body || ""}"

Write a reply I can send back.
Return JSON:
{ "body": "..." }`;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(raw);

    return NextResponse.json({ suggestion: parsed.body || "" });
  } catch (error) {
    console.error("[AI Suggest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}









