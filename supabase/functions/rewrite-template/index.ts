// Block 8410 — Smart Template Rewriter v1 (AI-Powered Template Variants)
// supabase/functions/rewrite-template/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.69.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openAIApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
}

if (!openAIApiKey) {
  console.error("Missing OPENAI_API_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openAIApiKey });

const REWRITER_VERSION = "gpt-4.1-mini-template-rewriter-v1";

// Block 8470 — Plan gating helpers
type PlanName = "free" | "pro" | "enterprise" | "unknown";

function normalizePlan(plan?: string | null, status?: string | null): {
  plan: PlanName;
  status: string;
} {
  const rawPlan = (plan ?? "free").toLowerCase() as PlanName;
  const rawStatus = (status ?? "inactive").toLowerCase();

  if (rawPlan === "pro" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "pro", status: rawStatus };
  }
  if (rawPlan === "enterprise" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "enterprise", status: rawStatus };
  }
  if (rawPlan === "free") {
    return { plan: "free", status: rawStatus };
  }
  return { plan: "unknown", status: rawStatus };
}

function hasProAI(planInfo: { plan: PlanName; status: string }): boolean {
  return planInfo.plan === "pro" || planInfo.plan === "enterprise";
}

type RewriteIntent =
  | "shorter"
  | "longer"
  | "more_casual"
  | "more_formal"
  | "new_angle"
  | "subject_only";

interface Variant {
  label: string;
  subject: string;
  body: string;
}

interface RewriterResult {
  variants: Variant[];
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const templateId = body?.template_id as string | undefined;
    const intent = body?.intent as RewriteIntent | undefined;
    const ownerUserId = body?.owner_user_id as string | undefined;

    if (!templateId || !intent) {
      return new Response(
        JSON.stringify({ error: "Missing template_id or intent" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // 1. Load base template
    // Try to get all possible user identifier columns
    const { data: template, error: tplError } = await supabase
      .from("email_templates")
      .select("id, name, subject, body, owner_user_id, user_id, owner_id")
      .eq("id", templateId)
      .single();

    if (tplError || !template) {
      console.error("Template not found:", tplError);
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        { status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Block 8470 — Plan gating: Check if user has Pro AI access
    const templateOwnerId = template.owner_user_id ?? template.user_id ?? template.owner_id ?? ownerUserId;
    if (templateOwnerId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("plan, plan_status")
        .eq("id", templateOwnerId)
        .single();

      if (profileError || !profile) {
        console.error("No profile found for template owner:", profileError);
      } else {
        const planInfo = normalizePlan(profile.plan, profile.plan_status);
        if (!hasProAI(planInfo)) {
          return new Response(
            JSON.stringify({ error: "Smart template rewriter is only available on Pro plans." }),
            { status: 402, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          );
        }
      }
    }

    const subject = (template.subject ?? "").toString();
    const emailBody = (template.body ?? "").toString();

    if (!subject.trim() && !emailBody.trim()) {
      return new Response(
        JSON.stringify({ error: "Template has no content" }),
        { status: 422, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // 2. Build instructions based on intent
    let intentDescription = "";
    let numVariants = 3;
    switch (intent) {
      case "shorter":
        intentDescription =
          "Make the email significantly shorter and punchier, while preserving the core offer. Keep 3–6 sentences total.";
        numVariants = 3;
        break;
      case "longer":
        intentDescription =
          "Expand the email with more context and clarity, but stay concise. Use up to 3 short paragraphs.";
        numVariants = 2;
        break;
      case "more_casual":
        intentDescription =
          "Rewrite in a more casual, conversational tone while staying professional and respectful.";
        numVariants = 3;
        break;
      case "more_formal":
        intentDescription =
          "Rewrite in a more formal, polished tone suitable for executives.";
        numVariants = 2;
        break;
      case "new_angle":
        intentDescription =
          "Rewrite the email to focus on a different angle of value (e.g., speed, ROI, reduced workload) while staying on the same product.";
        numVariants = 3;
        break;
      case "subject_only":
        intentDescription =
          "Only generate new subject lines; keep the body empty. Focus on high-open-rate, non-clickbaity subjects.";
        numVariants = 5;
        break;
    }

    const userPrompt = `
You are rewriting an outbound cold email template.

Original template name: ${template.name ?? "(unnamed)"}

Original subject:
"${subject}"

Original body:
"""${emailBody}"""

Goal:
${intentDescription}

Audience:
- Busy business owners or operators
- They receive many cold emails, so clarity and respect matter

Guidelines:
- Do not fabricate specific numbers or case studies.
- Do not promise outcomes you can't justify; keep claims reasonable.
- Avoid spammy language or all caps.
- Keep it easy to skim.

Return a list of ${numVariants} variants. For each variant, include:
- "label": short human-readable label describing the change (e.g. "Short & Direct", "Casual ROI angle").
- "subject": the subject line (for subject_only, body should be empty).
- "body": the email body (omit or empty for subject_only).

`.trim();

    // 3. Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert cold email copywriter specializing in B2B outreach for founders and sales teams.",
        },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "template_variants",
          schema: {
            type: "object",
            properties: {
              variants: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    subject: { type: "string" },
                    body: { type: "string" },
                  },
                  required: ["label", "subject", "body"],
                  additionalProperties: false,
                },
              },
            },
            required: ["variants"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });

    const jsonPart = response.choices[0]?.message?.content ?? "{}";
    let parsed: RewriterResult;
    try {
      parsed = JSON.parse(jsonPart) as RewriterResult;
    } catch (e) {
      console.error("Failed to parse variants JSON:", e, jsonPart);
      return new Response(
        JSON.stringify({ error: "Variant parse error" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const variants = parsed.variants ?? [];

    if (!Array.isArray(variants) || variants.length === 0) {
      return new Response(
        JSON.stringify({ error: "No variants generated" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // 4. Insert variants into template_variants
    const rowsToInsert = variants.map((v) => ({
      template_id: template.id,
      owner_user_id: ownerUserId ?? null,
      label: v.label,
      intent,
      subject: v.subject,
      body: v.body,
      metadata: {
        rewriter_version: REWRITER_VERSION,
      },
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("template_variants")
      .insert(rowsToInsert)
      .select("id, label, subject, body, created_at");

    if (insertError) {
      console.error("Failed to insert template_variants:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save variants" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        template_id: template.id,
        intent,
        variants: inserted,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error("Unhandled error in rewrite-template:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
