import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { thread_id } = await req.json();

    if (!thread_id) {
      return NextResponse.json(
        { error: "thread_id is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const supabase = createClient();

    // Fetch thread with messages and lead data
    // Try inbox_threads first (used by ThreadPane)
    const { data: inboxThread, error: inboxError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        campaign_id,
        lead_id,
        ai_intent,
        leads:lead_id (
          id,
          email,
          first_name,
          last_name,
          company,
          title,
          score_v3,
          score_v2,
          intent_primary
        )
      `)
      .eq("id", thread_id)
      .maybeSingle();

    if (inboxError && !inboxThread) {
      // Fallback to reply_threads
      const { data: replyThread, error: replyError } = await supabase
        .from("reply_threads")
        .select(`
          id,
          campaign_id,
          lead_id,
          intent_primary,
          leads:lead_id (
            id,
            email,
            first_name,
            last_name,
            company,
            title,
            score_v3,
            score_v2,
            intent_primary
          )
        `)
        .eq("id", thread_id)
        .maybeSingle();

      if (replyError || !replyThread) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 }
        );
      }

      // Fetch messages from reply_messages
      const { data: messages } = await supabase
        .from("reply_messages")
        .select("id, direction, body, created_at")
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: true });

      const thread = replyThread;
      const lead = Array.isArray(thread.leads) ? thread.leads[0] : thread.leads;

      // Generate follow-up
      const variants = await generateFollowUp({
        messages: messages || [],
        lead: lead || null,
        intent: thread.intent_primary || null,
        score: lead?.score_v3 || lead?.score_v2 || null,
      });

      // Save to reply_threads
      await supabase
        .from("reply_threads")
        .update({
          ai_next_followup: variants[0],
          ai_next_followup_variants: variants,
        })
        .eq("id", thread_id);

      return NextResponse.json({ variants });
    }

    // Use inbox_threads path
    const thread = inboxThread;
    const lead = Array.isArray(thread.leads) ? thread.leads[0] : thread.leads;

    // Fetch messages from inbox_messages
    const { data: messages } = await supabase
      .from("inbox_messages")
      .select("id, direction, body_html, body_text, snippet, created_at")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true });

    // Generate follow-up
    const variants = await generateFollowUp({
      messages: messages || [],
      lead: lead || null,
      intent: (thread as any).ai_intent || lead?.intent_primary || null,
      score: lead?.score_v3 || lead?.score_v2 || null,
    });

    // Save to inbox_threads
    await supabase
      .from("inbox_threads")
      .update({
        ai_next_followup: variants[0],
        ai_next_followup_variants: variants,
      })
      .eq("id", thread_id);

    return NextResponse.json({ variants });
  } catch (error) {
    console.error("[AI Follow-Up] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate follow-up",
      },
      { status: 500 }
    );
  }
}

async function generateFollowUp({
  messages,
  lead,
  intent,
  score,
}: {
  messages: any[];
  lead: any;
  intent: string | null;
  score: number | null;
}) {
  // Build thread history
  const threadHistory = messages
    .map((m) => {
      const direction = m.direction?.toUpperCase() || "UNKNOWN";
      const body =
        m.body_html || m.body_text || m.body || m.snippet || "(no content)";
      // Strip HTML tags for plain text
      const plainBody = body.replace(/<[^>]*>/g, "").trim();
      return `${direction}: ${plainBody}`;
    })
    .join("\n\n");

  // Determine tone based on score and intent
  let toneGuidance = "";
  if (score !== null) {
    if (score >= 80) {
      toneGuidance = "direct/personal";
    } else if (score >= 50) {
      toneGuidance = "friendly + helpful";
    } else {
      toneGuidance = "ultra concise";
    }
  }

  let intentGuidance = "";
  if (intent === "meeting_intent") {
    intentGuidance = "short + confirm availability";
  } else if (intent === "interested") {
    intentGuidance = "helpful + ask small question";
  } else if (intent === "not_interested") {
    intentGuidance = "polite exit or objection handling";
  } else {
    intentGuidance = "value-providing";
  }

  const leadData = lead
    ? {
        email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        company: lead.company,
        title: lead.title,
        score: score,
      }
    : null;

  const prompt = `You are SmartSend AI Follow-Up Brain v1.
Write the next best follow-up email based on:

### Thread History:

${threadHistory || "(no messages yet)"}

### Lead Data:

${JSON.stringify(leadData, null, 2)}

### Intent Detected:

${intent || "neutral"}

### Score-Based Tone:

${toneGuidance || "neutral"}

### Intent-Based Approach:

${intentGuidance}

### Rules:

- Keep deliverability high (avoid spammy phrasing)
- Short, human, natural
- Personalize with {{first_name}}, {{company}}, {{your_name}} placeholders
- Avoid salesy pressure
- Match lead's tone + intent
- Write 3 variants:
  A = soft + friendly
  B = more direct
  C = ultra concise

Output ONLY valid JSON in this exact format:

{
  "variants": [
    "version_A_text_here",
    "version_B_text_here",
    "version_C_text_here"
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.55,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  try {
    const parsed = JSON.parse(content);
    if (
      !parsed.variants ||
      !Array.isArray(parsed.variants) ||
      parsed.variants.length !== 3
    ) {
      throw new Error("Invalid response format");
    }
    return parsed.variants;
  } catch (parseError) {
    console.error("Failed to parse OpenAI response:", content);
    // Fallback: return default variants
    return [
      `Hi ${lead?.first_name ? `{{first_name}}` : "there"},\n\nHope your week's going well. Just wanted to follow up in case my last note slipped through — totally understand if timing has been hectic.\n\nIf you're open to it, I can send a quick summary of how others in ${lead?.company ? `{{company}}` : "your industry"} are using SmartSend to book meetings more consistently.\n\nEither way, appreciate your time.\n– {{your_name}}`,
      `${lead?.first_name ? `{{first_name}}` : "Hi"}, quick nudge here.\n\nHappy to share a 2-minute breakdown on how we help ${lead?.company ? `{{company}}` : "teams"}-type teams automate their cold outreach. Want me to send it?\n\n– {{your_name}}`,
      `Hey ${lead?.first_name ? `{{first_name}}` : "there"}, still open to chatting?\n\n– {{your_name}}`,
    ];
  }
}

