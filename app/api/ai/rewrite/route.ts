import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { createClient } from "@/lib/supabase/server";
import { runPreflight } from "@/lib/content/preflight";
import { resolvePromptPack } from "@/lib/prompts/resolve";

const schema = z.object({
  campaignId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  controls: z.object({
    tone: z.enum([
      "professional",
      "friendly",
      "concise",
      "assertive",
      "curious",
      "warm",
      "direct",
      "playful",
    ]).default("professional"),
    persona: z.enum([
      "founder",
      "sales_rep",
      "consultant",
      "recruiter",
      "support",
    ]).default("sales_rep"),
    length: z.enum(["short", "medium", "long"]).default("medium"),
    gradeLevel: z.number().min(5).max(14).default(8),
    ctaStyle: z.enum(["single", "dual", "soft"]).default("single"),
    rules: z.array(z.string()).default([]),
    keepVars: z.boolean().default(true),
  }).default({
    tone: "professional",
    persona: "sales_rep",
    length: "medium",
    gradeLevel: 8,
    ctaStyle: "single",
    rules: [],
    keepVars: true,
  }),
});

  const DEFAULT_SYSTEM_PROMPT = `
You rewrite cold email templates. Return STRICT JSON:
{
 "subject": "string",
 "body": "string"
}
Hard rules:
- Preserve variable tokens like {{first_name}}, {{company}}, {{title}}, {{my_first_name}} exactly.
- NEVER invent facts.
- Keep a single, skimmable structure: hook -> value -> proof/niche -> CTA.
- Keep line width readable (<= 90 chars); keep paragraphs tight.
- No tracking pixels, no link spam.
`;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues },
      { status: 400 },
    );
  }

  const { subject, body: srcBody, controls, campaignId, stepId } = parsed.data;

  // Resolve rewrite prompt pack if campaignId is provided
  let rewritePack = null;
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  let userTemplate = null;
  
  if (campaignId) {
    try {
      rewritePack = await resolvePromptPack({
        campaignId,
        stepNumber: null, // Could extract from stepId if needed
        kind: "rewrite",
      });
      
      if (rewritePack) {
        systemPrompt = rewritePack.system_prompt;
        userTemplate = rewritePack.user_template;
      }
    } catch (error) {
      console.error("Failed to resolve rewrite prompt pack:", error);
      // Continue with default prompt
    }
  }

  // Load brand style guide if campaignId is provided
  let brandConstraints = "";
  if (campaignId) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("account_id, user_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaign) {
      const accountId = campaign.account_id || campaign.user_id;

      // Load campaign-specific style guide first, then account-wide
      const { data: bsgCampaign } = await supabase
        .from("brand_style_guides")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("scope", "campaign")
        .maybeSingle();

      const { data: bsgAccount } = await supabase
        .from("brand_style_guides")
        .select("*")
        .eq("account_id", accountId)
        .eq("scope", "account")
        .is("campaign_id", null)
        .maybeSingle();

      const bsg = bsgCampaign || bsgAccount;

      if (bsg) {
        const style = {
          length_limits: bsg.length_limits ?? { subject_max: 100, body_max: 2000 },
          required_tags: bsg.required_tags ?? [],
          can_include_links: bsg.can_include_links ?? true,
          formatting_rules: bsg.formatting_rules ?? "",
        };

        // Load phrase banks
        const { data: allowCampaign } = await supabase
          .from("brand_phrase_bank")
          .select("phrase")
          .eq("campaign_id", campaignId)
          .eq("kind", "allow");

        const { data: denyCampaign } = await supabase
          .from("brand_phrase_bank")
          .select("phrase")
          .eq("campaign_id", campaignId)
          .eq("kind", "deny");

        const { data: allowAccount } = await supabase
          .from("brand_phrase_bank")
          .select("phrase")
          .eq("account_id", accountId)
          .is("campaign_id", null)
          .eq("kind", "allow");

        const { data: denyAccount } = await supabase
          .from("brand_phrase_bank")
          .select("phrase")
          .eq("account_id", accountId)
          .is("campaign_id", null)
          .eq("kind", "deny");

        const allow = [
          ...(allowCampaign?.map((x) => x.phrase) ?? []),
          ...(allowAccount?.map((x) => x.phrase) ?? []),
        ];
        const deny = [
          ...(denyCampaign?.map((x) => x.phrase) ?? []),
          ...(denyAccount?.map((x) => x.phrase) ?? []),
        ];

        brandConstraints = `
Brand guardrails:
- ${bsg.voice_principles ? `Voice principles: ${bsg.voice_principles}` : ""}
- ${style.formatting_rules || "No emojis. Keep concise with one CTA."}
- Subject <= ${style.length_limits?.subject_max ?? 100} chars; Body <= ${style.length_limits?.body_max ?? 2000} chars.
- ${
          style.can_include_links === false
            ? "Do not add any links."
            : "Limit to ≤3 links total."
        }
${deny.length > 0 ? `- Forbidden phrases: ${deny.map((d) => `"${d}"`).join(", ")}` : ""}
${allow.length > 0 ? `- Preferred vocabulary: ${allow.map((a) => `"${a}"`).join(", ")}` : ""}
`;
      }
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const systemPromptWithBrand = systemPrompt + (brandConstraints ? "\n" + brandConstraints : "");

  // Use user_template if available, otherwise build default user message
  let userMsg: string;
  if (userTemplate) {
    // Replace template variables with actual values
    userMsg = userTemplate
      .replace(/\{\{tone\}\}/g, controls.tone)
      .replace(/\{\{persona\}\}/g, controls.persona)
      .replace(/\{\{length\}\}/g, controls.length)
      .replace(/\{\{grade_level\}\}/g, String(controls.gradeLevel))
      .replace(/\{\{cta_style\}\}/g, controls.ctaStyle)
      .replace(/\{\{rules\}\}/g, controls.rules.join(" | ") || "none")
      .replace(/\{\{preserve_vars\}\}/g, controls.keepVars ? "true" : "false")
      .replace(/\{\{subject\}\}/g, subject)
      .replace(/\{\{body\}\}/g, srcBody);
  } else {
    userMsg = `
Rewrite with controls:
- tone: ${controls.tone}
- persona: ${controls.persona}
- target_length: ${controls.length}
- grade_level: ${controls.gradeLevel}
- cta_style: ${controls.ctaStyle}
- extra_rules: ${controls.rules.join(" | ") || "none"}
- preserve_vars: ${controls.keepVars ? "true" : "false"}

SOURCE_SUBJECT:
${subject}

SOURCE_BODY:
${srcBody}
`.trim();
  }

  const t0 = Date.now();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPromptWithBrand },
      { role: "user", content: userMsg },
    ],
  });
  const latency = Date.now() - t0;

  const txt = completion.choices[0]?.message?.content || "{}";
  let out: { subject?: string; body?: string };

  try {
    out = JSON.parse(txt);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Bad JSON from model" },
      { status: 500 },
    );
  }

  if (!out.subject || !out.body) {
    return NextResponse.json(
      { ok: false, error: "Model response missing subject/body" },
      { status: 500 },
    );
  }

  // Run preflight check on rewritten content if campaignId is provided
  if (campaignId && rewritePack) {
    try {
      const preflightResult = await runPreflight({
        campaignId,
        subject: out.subject,
        body: out.body,
        tone: controls.tone,
      });

      if (!preflightResult.ok) {
        // Check if there are blocking issues that would trigger rollback
        const blockingIssues = preflightResult.issues.filter(
          (i) =>
            i.code === "MISSING_TAG" ||
            i.code === "SUBJECT_TOO_LONG" ||
            i.code === "BODY_TOO_LONG" ||
            i.code === "LINKS_BLOCKED" ||
            i.code === "FORBIDDEN_PHRASE"
        );

        // Auto-rollback if blocking issues found after version bump
        if (blockingIssues.length > 0) {
          try {
            const { rollbackPromptVersion } = await import("@/lib/prompts/rollback");
            const rollbackResult = await rollbackPromptVersion({
              campaignId,
              kind: "rewrite",
              stepNumber: null,
              failedVersion: rewritePack.version,
              packId: rewritePack.pack_id,
            });

            if (rollbackResult.rolledBack) {
              return NextResponse.json({
                ok: false,
                error: "Preflight failed - prompt version rolled back",
                preflightIssues: preflightResult.issues,
                rolledBackTo: rollbackResult.previousVersion,
                warning: `Prompt pack version ${rewritePack.version} caused preflight failures. Rolled back to version ${rollbackResult.previousVersion}.`,
              });
            }
          } catch (rollbackError) {
            console.error("Failed to rollback prompt version:", rollbackError);
          }
        }

        // Return the rewritten content but include preflight issues as warnings
        return NextResponse.json({
          ok: true,
          subject: out.subject,
          body: out.body,
          preflightIssues: preflightResult.issues,
          warning: "Preflight check found issues. Review before sending.",
        });
      }
    } catch (preflightError) {
      // Log but don't fail the rewrite if preflight fails
      console.error("Preflight check failed:", preflightError);
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { ok: false, error: profileError.message },
      { status: 500 },
    );
  }

  if (!profile?.account_id) {
    return NextResponse.json(
      { ok: false, error: "Account not found for user" },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase
    .from("rewrite_sessions")
    .insert({
      account_id: profile.account_id,
      user_id: user.id,
      campaign_id: campaignId ?? null,
      step_id: stepId ?? null,
      source_subject: subject,
      source_body: srcBody,
      controls,
      output_subject: out.subject,
      output_body: out.body,
      model: completion.model ?? "gpt-4o-mini",
      tokens: completion.usage?.total_tokens ?? null,
      latency_ms: latency,
    });

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    subject: out.subject,
    body: out.body,
  });
}
