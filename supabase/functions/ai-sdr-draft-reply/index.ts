import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

type ThreadMessage = {
  from: "lead" | "me";
  body: string;
  ts: string;
};

type Payload = {
  lead_id: string;
  thread: ThreadMessage[];
  persona_prompt?: string;
  sdr_notes?: string;
  user_id?: string; // optional for backward compatibility
  thread_id?: string; // optional for backward compatibility
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

  const body = (await req.json()) as Payload;
  const { lead_id, thread, persona_prompt, sdr_notes, user_id, thread_id } = body;

  // Support both new format (lead_id + thread) and legacy format (thread_id)
  if (thread_id && (!lead_id || !thread)) {
    // Legacy format - use existing logic
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required for legacy format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return handleLegacyFormat(supabase, openai, user_id, thread_id);
  }

  if (!lead_id || !thread) {
    return new Response(
      JSON.stringify({ error: "lead_id and thread are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch lead details
  const { data: lead } = await supabase
    .from("leads")
    .select("first_name, last_name, email, title, company")
    .eq("id", lead_id)
    .single();

  if (!lead) {
    return new Response(
      JSON.stringify({ error: "Lead not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Build thread text from array
  const threadText = thread
    .map(
      (m) =>
        `${m.from === "lead" ? "Lead" : "You"} (${m.ts}):\n${m.body}\n`
    )
    .join("\n---\n");

  // Build user prompt
  const userPrompt = `
${persona_prompt || "You are an elite SDR email assistant."}

Write a clean, human-style SDR reply email.

Context about the lead:
- Name: ${lead.first_name ?? ""} ${lead.last_name ?? ""}
- Title: ${lead.title ?? "unknown"}
- Company: ${lead.company ?? "unknown"}
- Email: ${lead.email}

SDR Notes:
${sdr_notes || "(none)"}

Full conversation thread:
${threadText}

Your task:
- Draft a natural human email reply that continues the conversation.
- Keep tone consistent with persona.
- Be clear, short, and helpful.
- No AI disclaimers. No filler. No emojis.
- Provide the email body only.
  `.trim();

  // OpenAI call
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an elite SDR email assistant." },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 300,
    temperature: 0.25,
  });

  const draft = completion.choices[0].message.content?.trim() || "";

  if (!draft) {
    return new Response(
      JSON.stringify({ error: "Failed to generate draft" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Optionally store draft
  if (user_id) {
    await supabase.from("sdr_reply_drafts").insert({
      lead_id,
      user_id,
      draft_text: draft,
      source: "manual",
    }).catch((err) => {
      console.error("Failed to save draft:", err);
      // Don't fail the request if draft save fails
    });
  }

  return new Response(
    JSON.stringify({ draft }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

// Legacy format handler for backward compatibility
async function handleLegacyFormat(
  supabase: any,
  openai: OpenAI,
  user_id: string,
  thread_id: string
) {
  // 1) Fetch thread overview
  const { data: thread } = await supabase
    .from("ai_sdr_thread_overview")
    .select("*")
    .eq("thread_id", thread_id)
    .single();

  if (!thread) {
    return new Response("Thread not found", { status: 404 });
  }

  // 2) Fetch timeline for AI context
  const { data: timeline } = await supabase
    .from("ai_sdr_timeline_items")
    .select("*")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: true });

  // 3) Fetch user settings
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle();

  // 4) Fetch campaign + playbook
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, subject, ai_sdr_playbook_id")
    .eq("id", thread.campaign_id)
    .maybeSingle();

  const { data: playbook } = campaign?.ai_sdr_playbook_id
    ? await supabase
        .from("ai_sdr_playbooks")
        .select("*")
        .eq("id", campaign.ai_sdr_playbook_id)
        .maybeSingle()
    : { data: null as any };

  // Build richer system prompt
  const toneStyle = userSettings?.email_tone ?? "professional";
  const signoff = userSettings?.default_signoff ?? "";
  const companyName = userSettings?.company_name ?? "";
  const roleTitle = userSettings?.role_title ?? "";
  const websiteUrl = userSettings?.website_url ?? "";

  const system = `
You are the AI SDR reply engine for SmartSend.

You write replies on behalf of:
- Company: ${companyName || "the user's company"}
- Role: ${roleTitle || "Founder"}
- Website: ${websiteUrl || "N/A"}

Tone: "${toneStyle}" (adapt but keep it B2B appropriate).

Playbook (if present):
${playbook ? `
Name: ${playbook.name}
Target Persona: ${playbook.target_persona}
Primary Goal: ${playbook.primary_goal}
Approach Style: ${playbook.approach_style}
Messaging Guidelines:
${playbook.messaging_guidelines ?? ""}
Objection Handling Guidelines:
${playbook.objection_handling_guidelines ?? ""}
Closing Style:
${playbook.closing_style ?? ""}
Extra Config JSON:
${JSON.stringify(playbook.config ?? {}, null, 2)}
` : "No custom playbook. Use general B2B sales best practices."}

Your job:
- Read the full timeline of emails, AI events, and meetings.
- Understand what the lead wants and where we are in the sales motion.
- Generate a short, crisp, human-like reply following this playbook.
- 2–4 sentences, max.
- Use at most 1 clear CTA.
- Do NOT mention AI or automation.
- If a meeting exists, confirm or nudge toward that.
- If lead objects, follow the objection-handling guidelines.
- If lead is cold, respect it but leave door open (if appropriate).

Sign off using: "${signoff}" if it makes sense (don't duplicate if already in body).

Return ONLY JSON:
{
  "subject": "...",
  "body": "..."
}
`.trim();

  // Timeline context snippet
  const userPrompt = `
THREAD OVERVIEW:
${JSON.stringify(thread, null, 2)}

CAMPAIGN:
${JSON.stringify(campaign ?? {}, null, 2)}

TIMELINE:
${JSON.stringify(timeline ?? [], null, 2)}

Generate a reply to the LAST INBOUND MESSAGE in this timeline.
  `.trim();

  // 5) OpenAI call
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  let parsed;
  try {
    const content = completion.choices[0].message.content || "{}";
    parsed = JSON.parse(content);
  } catch {
    return new Response(JSON.stringify({ error: "Bad model output" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json" }
  });
}

