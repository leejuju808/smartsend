import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TonePreset = "short_direct" | "friendly_helpful" | "detailed";
type Mode = "generate" | "regenerate" | "improve" | "shorten";

interface ReplyCopilotRequest {
  thread_id: string;
  tone: TonePreset;
  mode?: Mode;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getThreadContext(threadId: string) {
  // Get thread with campaign and lead
  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id, subject")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    throw new Error("Thread not found");
  }

  // Get last 10 messages
  const { data: messages } = await supabase
    .from("inbox_messages")
    .select("id, direction, subject, body_text, body_html, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Reverse to get chronological order
  const threadMessages = (messages || []).reverse();

  // Get lead data
  const { data: lead } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, company, title, timezone")
    .eq("id", thread.lead_id)
    .maybeSingle();

  // Get campaign data
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, purpose")
    .eq("id", thread.campaign_id)
    .maybeSingle();

  // Get variant if available (from latest outbound message or campaign)
  let variant = null;
  const latestOutbound = threadMessages
    .filter((m) => m.direction === "outbound")
    .pop();
  if (latestOutbound) {
    // Try to get variant from message metadata or campaign
    // This is a placeholder - adjust based on your actual schema
  }

  // Get detected intent from reply_brain_inferences or inbox_messages
  let detectedIntent = null;
  const latestInbound = threadMessages
    .filter((m) => m.direction === "inbound")
    .pop();
  
  if (latestInbound) {
    // Check inbox_messages for ai_intent
    if (latestInbound.id) {
      const { data: msgWithIntent } = await supabase
        .from("inbox_messages")
        .select("ai_intent, ai_label, ai_confidence")
        .eq("id", latestInbound.id)
        .maybeSingle();
      
      if (msgWithIntent?.ai_intent) {
        detectedIntent = {
          intent: msgWithIntent.ai_intent,
          label: msgWithIntent.ai_label,
          confidence: msgWithIntent.ai_confidence,
        };
      }
    }

    // Also check reply_brain_inferences if available
    if (!detectedIntent && latestInbound.id) {
      const { data: inference } = await supabase
        .from("reply_brain_inferences")
        .select("intent, confidence, output")
        .eq("email_id", latestInbound.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (inference) {
        detectedIntent = {
          intent: inference.intent,
          confidence: inference.confidence,
          output: inference.output,
        };
      }
    }
  }

  return {
    thread,
    messages: threadMessages,
    lead,
    campaign,
    variant,
    detectedIntent,
    lastMessage: latestInbound,
  };
}

function buildPrompt(
  context: Awaited<ReturnType<typeof getThreadContext>>,
  tone: TonePreset,
  mode: Mode
) {
  const { messages, lead, campaign, detectedIntent, lastMessage } = context;

  // Build thread history summary
  const historyText = messages
    .map((m, idx) => {
      const text = stripHtml(m.body_html) || m.body_text || "";
      const sender = m.direction === "inbound" ? "Prospect" : "You";
      const preview = text.slice(0, 300);
      return `${idx + 1}. ${sender} (${new Date(m.created_at).toLocaleDateString()}): ${preview}${text.length > 300 ? "..." : ""}`;
    })
    .join("\n\n");

  // Build context summary
  const leadName = lead
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email
    : "Prospect";
  const leadTitle = lead?.title || "";
  const leadCompany = lead?.company || "";
  const campaignPurpose = campaign?.purpose || campaign?.name || "";

  // Build intent context
  let intentContext = "";
  if (detectedIntent) {
    const intent = detectedIntent.intent || detectedIntent.label;
    intentContext = `\n\nDetected Intent: ${intent}${detectedIntent.confidence ? ` (confidence: ${Math.round(detectedIntent.confidence * 100)}%)` : ""}`;
    
    // Add objection-specific guidance
    if (intent === "negative" || intent === "objection") {
      intentContext += "\nThis appears to be an objection. Address it directly and empathetically.";
    } else if (intent === "question") {
      intentContext += "\nThis is a question. Provide a clear, helpful answer.";
    } else if (intent === "meeting_interest" || intent === "positive") {
      intentContext += "\nThis shows interest. Move toward booking a meeting or next step.";
    }
  }

  // Latest message text
  const latestMessageText = lastMessage
    ? stripHtml(lastMessage.body_html) || lastMessage.body_text || ""
    : "";

  // Tone-specific instructions
  const toneInstructions = {
    short_direct: `Write a SHORT & DIRECT reply:
- 2-4 sentences maximum
- Get straight to the point
- Handle any objection quickly
- End with a clear CTA: propose a time or ask 1 question
- Keep it concise and action-oriented`,

    friendly_helpful: `Write a FRIENDLY & HELPFUL reply:
- Slightly warmer tone than short/direct
- Use supportive language
- Acknowledge pain points or concerns
- Provide helpful context when needed
- End with a slightly longer CTA that feels natural`,

    detailed: `Write a DETAILED / HIGH-CONTEXT reply:
- Pull in context from the campaign purpose: "${campaignPurpose}"
- Explain more thoroughly
- Useful for complex objections or when prospect asks deeper questions
- Provide comprehensive information
- Still maintain professional outbound tone`,
  };

  // Mode-specific instructions
  const modeInstructions = {
    generate: "",
    regenerate: "Generate a completely new draft with the same tone and context.",
    improve: "Improve the existing draft: clarify structure, tighten wording, enhance the CTA, make it more compelling.",
    shorten: "Reduce the length by approximately 40% while keeping all key content, clarity, and the CTA intact.",
  };

  const systemPrompt = `You are SmartSend AI's Reply Copilot. Your job is to draft a **clear, accurate, and concise** reply to a prospect's email.

CRITICAL RULES:
- Never invent facts beyond the thread context provided
- Address any objections explicitly (pricing, timing, not interested, wrong contact)
- Maintain professional outbound sales tone
- Match the selected tone preset exactly
- Offer to move conversation forward (meeting, resource, clarification)
- Keep formatting clean: plain-text only (no markdown, no HTML)
- Be authentic and human-sounding
- Never use placeholders like [Name] or {{variable}} - use actual names from context

${toneInstructions[tone]}

${modeInstructions[mode]}`;

  const userPrompt = `Reply to this email from ${leadName}${leadTitle ? ` (${leadTitle})` : ""}${leadCompany ? ` at ${leadCompany}` : ""}:

---
LATEST EMAIL:
${latestMessageText}
---

THREAD HISTORY (last ${messages.length} messages):
${historyText}
---

CONTEXT:
- Campaign: ${campaignPurpose}
- Lead: ${leadName}${leadTitle ? `, ${leadTitle}` : ""}${leadCompany ? ` at ${leadCompany}` : ""}${lead?.email ? ` (${lead.email})` : ""}
${intentContext}

Generate the reply draft now. Return ONLY the plain text reply body (no subject line, no metadata, just the message text).`;

  return {
    system: systemPrompt,
    user: userPrompt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: ReplyCopilotRequest = await req.json();
    const { thread_id, tone = "friendly_helpful", mode = "generate" } = body;

    if (!thread_id) {
      return NextResponse.json(
        { error: "Missing thread_id" },
        { status: 400 }
      );
    }

    // Get thread context
    const context = await getThreadContext(thread_id);

    // Build prompt
    const { system, user } = buildPrompt(context, tone, mode);

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate reply draft" },
        { status: 500 }
      );
    }

    const openaiData = await openaiResponse.json();
    const draft = openaiData.choices?.[0]?.message?.content || "";

    // Track analytics (light v1) - using existing table structure
    try {
      await supabase.from("ai_copilot_uses").insert({
        thread_id,
        action: `${tone}_${mode}`,
        ok: true,
      });
    } catch (analyticsError) {
      // Don't fail the request if analytics fails
      console.error("Analytics error:", analyticsError);
    }

    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error("Error in reply-copilot:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

