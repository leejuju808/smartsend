// Block 21491 — SmartSend AI Personalization Engine v1
// Personalizes campaign email templates with homeowner context and local flavor

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

type HomeownerContext = {
  first_name?: string;
  city?: string;
  property_notes?: string;
  roof_age_years?: number;
  last_job_notes?: string;
};

type PersonalizeContext = {
  sender_name?: string;
  company_name?: string;
  booking_link?: string;
};

type PersonalizeRequest = {
  campaign_id?: string;
  lead_id?: string;
  step?: number;
  template_subject: string;
  template_body: string;
  homeowner?: HomeownerContext;
  personalize?: PersonalizeContext;
};

function buildPrompt({
  template_subject,
  template_body,
  homeowner,
  personalize,
}: {
  template_subject: string;
  template_body: string;
  homeowner?: HomeownerContext;
  personalize?: PersonalizeContext;
}): string {
  const h = homeowner || {};
  const p = personalize || {};

  return `
You are personalizing a cold email for a LOCAL roofing company.

RULES:
- Keep subject short (max ~60 characters), clear, and human.
- Keep email body under 180 words.
- Sound like a normal, respectful person, not a hype marketer.
- Use the homeowner's first name if available.
- Reference their city naturally if given.
- If roof age or property notes are available, weave them in gently.
- Keep language simple, friendly, and to the point.
- Avoid spammy phrases ("limited time", "guaranteed", "act now").
- You MUST return valid JSON only in this format:

{
  "subject": "Final subject line here",
  "body": "Final email body here"
}

TEMPLATE SUBJECT:
${template_subject}

TEMPLATE BODY (with variables):
${template_body}

HOMEOWNER CONTEXT:
- First name: ${h.first_name ?? "Unknown"}
- City: ${h.city ?? "Unknown"}
- Roof age (years): ${h.roof_age_years ?? "Unknown"}
- Property notes: ${h.property_notes ?? "None"}
- Last job notes: ${h.last_job_notes ?? "None"}

SENDER CONTEXT:
- Sender name: ${p.sender_name ?? "Unknown"}
- Company name: ${p.company_name ?? "Local Roofing Company"}
- Booking link: ${p.booking_link ?? "None"}

Make sure you:
- Replace placeholders like {{homeowner_first_name}}, {{city}}, {{sender_name}}, {{company_name}}, {{booking_link}}.
- Keep the tone local and low-pressure.
`;
}

function simpleFallback(
  subject: string,
  body: string,
  homeowner?: HomeownerContext,
  personalize?: PersonalizeContext
) {
  const h = homeowner || {};
  const p = personalize || {};

  const replace = (text: string) =>
    text
      .replace(/{{\s*homeowner_first_name\s*}}/gi, h.first_name || "there")
      .replace(/{{\s*city\s*}}/gi, h.city || "your area")
      .replace(/{{\s*sender_name\s*}}/gi, p.sender_name || "")
      .replace(/{{\s*company_name\s*}}/gi, p.company_name || "")
      .replace(/{{\s*booking_link\s*}}/gi, p.booking_link || "");

  return {
    subject: replace(subject),
    body: replace(body),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: PersonalizeRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const {
    campaign_id,
    lead_id,
    step,
    template_subject,
    template_body,
    homeowner,
    personalize,
  } = body;

  if (!template_subject || !template_body) {
    return new Response("Missing template_subject or template_body", {
      status: 400,
    });
  }

  const prompt = buildPrompt({
    template_subject,
    template_body,
    homeowner,
    personalize,
  });

  let parsed: { subject?: string; body?: string };

  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You write short, natural-sounding cold emails for a local roofing company. You sound like a real human, not a marketer. You ALWAYS reply with JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("OpenAI error:", text);
      // Fallback to simple replacement
      const fallback = simpleFallback(
        template_subject,
        template_body,
        homeowner,
        personalize
      );
      parsed = { subject: fallback.subject, body: fallback.body };
    } else {
      const completion = await aiRes.json();
      const raw = completion.choices?.[0]?.message?.content ?? "{}";

      try {
        parsed = JSON.parse(raw);
      } catch {
        // Fallback: use templated subject/body with simple replacements
        const fallback = simpleFallback(
          template_subject,
          template_body,
          homeowner,
          personalize
        );
        parsed = { subject: fallback.subject, body: fallback.body };
      }
    }
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    // Fallback to simple replacement
    const fallback = simpleFallback(
      template_subject,
      template_body,
      homeowner,
      personalize
    );
    parsed = { subject: fallback.subject, body: fallback.body };
  }

  const subject = (parsed.subject || "").trim() || template_subject;
  const finalBody = (parsed.body || "").trim() || template_body;

  // Log personalization event (optional but helpful)
  if (campaign_id && lead_id && typeof step === "number") {
    const { error: logError } = await supabase
      .from("personalization_events")
      .insert({
        campaign_id,
        lead_id,
        step,
        model: "gpt-4o-mini",
        input_context: {
          homeowner,
          personalize,
          template_subject,
          template_body,
        },
        output_subject: subject,
        output_body: finalBody,
      });

    if (logError) {
      console.error("personalization_events insert error:", logError);
      // Don't fail the request if logging fails
    }
  }

  return new Response(
    JSON.stringify({
      subject,
      body: finalBody,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});














































