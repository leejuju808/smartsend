// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o-mini";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  campaign_id: string;
  step_no: number;
  variant_id?: string;
  subject_template?: string;
  body_html_template: string;
  tone?: "neutral" | "friendly" | "professional" | "casual" | "direct" | "playful";
  length?: "short" | "medium" | "long";
  temperature?: number;
  save?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "Missing authorization" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: me, error: meError } = await supabase.auth.getUser();
  if (meError || !me?.user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch (_error) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (!body.campaign_id || !Number.isInteger(body.step_no)) {
    return new Response(JSON.stringify({ ok: false, error: "Missing campaign or step" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const temperature = clamp(typeof body.temperature === "number" ? body.temperature : 0.5, 0, 1);

  const { data: camp, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, user_id")
    .eq("id", body.campaign_id)
    .single();

  if (campaignError || !camp || camp.user_id !== me.user.id) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const systemPrompt = buildSystemPrompt(body.tone, body.length);
  const toolHint = `When you output, keep all tokens like {{first_name}}, {{company}}, {{my_signature}} exactly intact.\nNever invent new variables. If content is missing, leave the variable as-is.\nReturn JSON: {"subject":"...","body_html":"..."} only.`;

  const userContent = `Current Subject:\n${body.subject_template || ""}\n\nCurrent HTML Body:\n${body.body_html_template}\n\n${toolHint}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return new Response(JSON.stringify({ ok: false, error: errText }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const json = await response.json();
  const parsed = safeParseJSON(
    json.output_text ??
      json.choices?.[0]?.message?.content ??
      json.output?.[0]?.content?.[0]?.text ??
      "{}"
  );

  const outSubject = String(parsed.subject ?? "").trim();
  const outBody = String(parsed.body_html ?? "").trim();

  await supabase.from("ai_rewrite_logs").insert({
    user_id: me.user.id,
    campaign_id: body.campaign_id,
    step_no: body.step_no,
    variant_id: body.variant_id ?? null,
    tone: body.tone ?? null,
    length_hint: body.length ?? null,
    temperature,
    input_subject: body.subject_template ?? null,
    input_body_html: body.body_html_template ?? null,
    output_subject: outSubject,
    output_body_html: outBody,
  });

  if (body.save && body.variant_id) {
    await supabase
      .from("campaign_step_variants")
      .update({
        subject_template: outSubject || body.subject_template,
        body_html_template: outBody || body.body_html_template,
      })
      .eq("id", body.variant_id)
      .eq("campaign_id", body.campaign_id);
  }

  return new Response(
    JSON.stringify({ ok: true, subject: outSubject, body_html: outBody }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
});

function buildSystemPrompt(
  tone?: Payload["tone"],
  length?: Payload["length"]
): string {
  const base = [
    "You are an expert cold-email copywriter for SMB outreach.",
    "Rewrite subject and HTML body while strictly preserving all {{variable_tokens}}.",
    "Keep formatting valid HTML. Avoid tracking language. No spammy words.",
    "Use American English. Make it concise, clear, and action-oriented.",
  ];

  switch (length) {
    case "short":
      base.push("Target 60–90 words body, subject ≤ 45 chars.");
      break;
    case "long":
      base.push("Target 140–220 words body, subject ≤ 60 chars.");
      break;
    default:
      base.push("Target 90–140 words body, subject ≤ 55 chars.");
      break;
  }

  base.push(`Tone: ${tone ?? "professional, friendly"}.`);

  return base.join("\n");
}

function safeParseJSON(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload);
  } catch (_err) {
    return {};
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}




