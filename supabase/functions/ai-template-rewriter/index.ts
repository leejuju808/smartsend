import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Load effective persona for a lead (lead override > org default > null)
 */
async function loadEffectivePersona(supabase: any, orgId: string | null, lead: any) {
  if (!orgId) return null;

  let personaId = lead.ai_persona_id || null;

  if (!personaId) {
    const { data: settings } = await supabase
      .from("sdr_settings")
      .select("default_persona_id")
      .eq("org_id", orgId)
      .maybeSingle();

    personaId = settings?.default_persona_id || null;
  }

  if (!personaId) return null;

  const { data: persona } = await supabase
    .from("sdr_personas")
    .select("*")
    .eq("id", personaId)
    .maybeSingle();

  return persona || null;
}

/**
 * Convert persona object to prompt string
 */
function personaToPrompt(persona: any | null): string {
  if (!persona) {
    return `
Persona:
- Style: concise, respectful, and practical
- Form: short paragraphs, no fluff
- Tone: direct but friendly
- Assume US English and sales-focused B2B tone
`.trim();
  }

  const avoid = (persona.avoid_phrases || []) as string[];
  return `
Persona:
- Name: ${persona.name}
- Description: ${persona.description}
- Tone: ${persona.tone || "neutral, friendly"}
- Formality: ${persona.formality || "neutral"}
- Email length: ${persona.email_length || "short"}
- Region: ${persona.region || "US"}
- Signature: ${persona.signature_hint || "First name only"}
- Avoid phrases: ${avoid.length ? avoid.join(", ") : "none"}
`.trim();
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500 },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const {
      lead_id,
      reply_id,
      template_key,
      org_id,
      default_subject,
      default_body,
      product_name,
      value_prop,
      sender_name,
      sender_role,
      sender_company,
    } = await req.json();

    if (!lead_id || !template_key) {
      return new Response(
        JSON.stringify({ error: "lead_id and template_key are required" }),
        { status: 400 },
      );
    }

    // 1) Load lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, title")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found", details: leadError }),
        { status: 404 },
      );
    }

    // 2) Load last reply (optional)
    let reply: any = null;
    if (reply_id) {
      const { data, error } = await supabase
        .from("lead_replies")
        .select("id, subject, body_text, intent_label, suggested_meeting_times")
        .eq("id", reply_id)
        .single();

      if (!error && data) reply = data;
    }

    // 3.5) Load recent/pinned notes for context
    const { data: notes, error: notesError } = await supabase
      .from("lead_notes")
      .select("note_type, title, body, is_pinned, score_delta, created_at")
      .eq("lead_id", lead_id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    let notesSummary = "";
    if (!notesError && notes && notes.length > 0) {
      notesSummary = notes
        .map((n) => {
          const type = n.note_type || "context";
          const title = n.title ? ` — ${n.title}` : "";
          return `• [${type}]${title}: ${n.body}`;
        })
        .join("\n");
    }

    // 3.6) Load effective persona (lead override > org default > fallback)
    const effectivePersona = await loadEffectivePersona(supabase, org_id || null, lead);
    const personaPrompt = personaToPrompt(effectivePersona);

    // 3) Load template
    let template: any = null;

    // org-specific
    if (org_id) {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("template_key", template_key)
        .eq("org_id", org_id)
        .maybeSingle();
      if (!error && data) template = data;
    }

    // fallback: global template (either NULL or fake UUID)
    if (!template) {
      const fakeGlobalOrgId = '00000000-0000-0000-0000-000000000000';
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("template_key", template_key)
        .or(`org_id.is.null,org_id.eq.${fakeGlobalOrgId}`)
        .maybeSingle();

      if (!error && data) template = data;
    }

    const baseSubject =
      default_subject ||
      template?.base_subject ||
      `Re: ${reply?.subject || "quick follow-up"}`;

    const baseBody =
      default_body ||
      template?.base_body ||
      `Hey {{FIRST_NAME}},\n\nJust following up on my last note.\n\nBest,\n{{SENDER_NAME}}`;

    const useAi =
      template?.use_ai_rewriter ??
      true; // default true if not set

    const tone = template?.tone || "neutral";
    const language = template?.language || "en";

    // Fill simple placeholders before AI sees it
    const firstName =
      (lead.first_name || "").trim() ||
      (lead.last_name ? "there" : "there");

    const originalSubject = reply?.subject || "";
    const company = lead.company || "";
    const title = lead.title || "";

    const meetingSlots = Array.isArray(reply?.suggested_meeting_times)
      ? reply.suggested_meeting_times
          .slice(0, 3)
          .map((slot: any) => `• ${slot.note || slot.time || slot}`)
          .join("\n")
      : "";

    const filledSubject = baseSubject
      .replace(/{{FIRST_NAME}}/g, firstName)
      .replace(/{{ORIGINAL_SUBJECT}}/g, originalSubject || "your note")
      .replace(/{{COMPANY}}/g, company || "")
      .replace(/{{PRODUCT}}/g, product_name || "{{PRODUCT}}");

    const filledBody = baseBody
      .replace(/{{FIRST_NAME}}/g, firstName)
      .replace(/{{COMPANY}}/g, company || "{{COMPANY}}")
      .replace(/{{TITLE}}/g, title || "{{TITLE}}")
      .replace(/{{PRODUCT}}/g, product_name || "{{PRODUCT}}")
      .replace(/{{VALUE_PROP}}/g, value_prop || "{{VALUE_PROP}}")
      .replace(/{{MEETING_SLOTS}}/g, meetingSlots || "")
      .replace(/{{SENDER_NAME}}/g, sender_name || "{{SENDER_NAME}}")
      .replace(/{{SENDER_ROLE}}/g, sender_role || "{{SENDER_ROLE}}")
      .replace(/{{SENDER_COMPANY}}/g, sender_company || "{{SENDER_COMPANY}}");

    if (!useAi) {
      // Return as-is
      return new Response(
        JSON.stringify({
          subject: filledSubject,
          body: filledBody,
          used_ai: false,
        }),
        { status: 200 },
      );
    }

    // 4) Call OpenAI to rewrite
    const systemPrompt = `
You are an expert SDR copywriter.

Rewrite the following cold email follow-up so that it:
- stays under ~150 words
- uses a clear, specific CTA (ask for a small next step)
- keeps the same intent (do NOT change from 'answer questions' to 'hard close', etc.)
- respects the given tone and language
- feels like a real human wrote it (not robotic)

NEVER change the factual content of their reply, but you can reference it.

Output JSON ONLY:

{
  "subject": "string",
  "body": "string"
}
`.trim();

    const userPrompt = `
${personaPrompt}

Lead:
- Name: ${firstName}
- Title: ${title || "unknown"}
- Company: ${company || "unknown"}
- Email: ${lead.email}

Human SDR notes:
${notesSummary || "(none)"}

Template intent key: ${template_key}
Tone: ${tone}
Language: ${language}
Product: ${product_name || "our solution"}
Value prop: ${value_prop || "better response rates on your outbound"}

Last reply (may be empty):
Subject: ${reply?.subject || "(no subject)"}
Body:
${reply?.body_text || "(no body)"}

Base subject:
${filledSubject}

Base body:
${filledBody}
`.trim();

    const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      console.error("OpenAI error", errText);
      // fallback: return non-AI version
      return new Response(
        JSON.stringify({
          subject: filledSubject,
          body: filledBody,
          used_ai: false,
          error: "openai_failed",
        }),
        { status: 200 },
      );
    }

    const completionJson = await completionRes.json();
    const content = completionJson.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({
          subject: filledSubject,
          body: filledBody,
          used_ai: false,
          error: "no_ai_content",
        }),
        { status: 200 },
      );
    }

    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse JSON from OpenAI:", content);
      return new Response(
        JSON.stringify({
          subject: filledSubject,
          body: filledBody,
          used_ai: false,
          error: "ai_json_parse_failed",
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        subject: parsed.subject || filledSubject,
        body: parsed.body || filledBody,
        used_ai: true,
      }),
      { status: 200 },
    );
  } catch (err) {
    console.error("ai-template-rewriter error", err);
    return new Response(
      JSON.stringify({ error: "unexpected", details: String(err) }),
      { status: 500 },
    );
  }
});
