import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.21.0";
import { createHash } from "crypto";
import { renderTemplate } from "../_shared/render.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration");
}

if (!openAiKey) {
  throw new Error("Missing OpenAI configuration");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: openAiKey });

type LeadContext = {
  industry?: string | null;
  role?: string | null;
  tech_stack?: string[] | null;
  region?: string | null;
};

type GenerateRequest = {
  owner_id?: string;
  campaign_id?: string | null;
  label?: string;
  tone?: string | null;
  thread_summary?: string | null;
  vars?: Record<string, any> | null;
  lead_context?: LeadContext | null;
  preview_prompt?: string | null;
};

function guardMergeTags(text: string | null | undefined) {
  if (!text) return;
  const bad = text.match(/\{\{[^}\s]+\s+[^}]+\}\}/g);
  if (bad) {
    throw new Error(`Invalid merge-tags: ${bad.join(", ")}`);
  }
}

function renderMergeTags(template: string, vars: Record<string, any>): string {
  return renderTemplate(template || "", vars ?? {});
}

async function makeEmbedding(text: string): Promise<number[]> {
  const fallback = text && text.trim().length > 0 ? text : "generic personalization";
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: fallback.slice(0, 8000)
  });
  return response.data[0].embedding;
}

function buildQueryText(
  vars: Record<string, any> | null | undefined,
  lead: LeadContext | null | undefined,
  threadSummary?: string | null
): string {
  const parts: string[] = [];
  if (vars?.company) parts.push(`Company: ${vars.company}`);
  if (vars?.first_name || lead?.role) {
    const role = lead?.role ? `, Role: ${lead.role}` : "";
    parts.push(`Contact: ${vars?.first_name ?? "Unknown"}${role}`);
  }
  if (lead?.industry) parts.push(`Industry: ${lead.industry}`);
  if (lead?.region) parts.push(`Region: ${lead.region}`);
  if (Array.isArray(lead?.tech_stack) && lead!.tech_stack!.length > 0) {
    parts.push(`Tech: ${lead!.tech_stack!.join(",")}`);
  }
  if (threadSummary) parts.push(threadSummary);
  return parts.filter(Boolean).join("\n");
}

function buildDedupeKey(payload: Record<string, any>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" }
      });
    }

    let body: GenerateRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const ownerId = body.owner_id;
    const label = body.label;
    const toneInput = typeof body.tone === "string" ? body.tone.trim() : null;
    const previewPrompt = typeof body.preview_prompt === "string"
      ? body.preview_prompt.trim()
      : null;

    if (!ownerId || typeof ownerId !== "string" || !label || typeof label !== "string") {
      return new Response(JSON.stringify({ error: "Missing owner_id or label" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const campaignId = body.campaign_id ?? null;
    const vars = body.vars ?? {};
    const leadContext = body.lead_context ?? {};
    const threadSummary = body.thread_summary ?? null;

    let promptTemplate: string;
    let toneUsed: string;
    let isOverride = false;
    const isPreview = Boolean(previewPrompt);

    if (isPreview) {
      if (!previewPrompt) {
        return new Response(JSON.stringify({ error: "Preview prompt missing" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      if (!toneInput) {
        return new Response(JSON.stringify({ error: "Preview tone required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      guardMergeTags(previewPrompt);
      promptTemplate = previewPrompt;
      toneUsed = toneInput;
    } else {
      const { data: picked, error: pickError } = await supabase
        .rpc("pick_nudge_ucb", {
          owner: ownerId,
          campaign: campaignId,
          label_input: label,
          c: 0.8
        })
        .maybeSingle();

      if (pickError) {
        console.error("pick_nudge_ucb failed", pickError);
        return new Response(JSON.stringify({ error: "Preset lookup failed" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        });
      }

      if (!picked || !picked.prompt || !picked.tone) {
        return new Response(JSON.stringify({ error: "No active preset for label" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }

      guardMergeTags(picked.prompt);
      promptTemplate = picked.prompt;
      toneUsed = picked.tone;
      isOverride = picked.is_override ?? false;
    }

    const promptMerged = renderMergeTags(promptTemplate, vars ?? {});

    const queryText = buildQueryText(vars, leadContext, threadSummary);
    const embedding = await makeEmbedding(queryText || vars?.company || label);

    let snipBody: string | null = null;
    let snipId: string | null = null;
    let snipScore: number | null = null;
    let snipRole: string | null = null;
    let snipTech: string[] | null = null;
    let snipIndustry: string | null = null;
    let snipRegion: string | null = null;

    try {
      const { data: snippet, error: snipError } = await supabase
        .rpc("pick_personalization", {
          owner: ownerId,
          industry_in: leadContext?.industry ?? null,
          role_in: leadContext?.role ?? null,
          techs_in: leadContext?.tech_stack ?? null,
          region_in: leadContext?.region ?? null,
          query_vec: embedding,
          c: 0.6
        })
        .maybeSingle();

      if (snipError) {
        console.error("pick_personalization error", snipError);
      } else if (snippet) {
        snipBody = snippet.body ?? null;
        snipId = snippet.snippet_id ?? null;
        snipScore = snippet.score ?? null;
        snipRole = snippet.role_hint ?? null;
        snipTech = Array.isArray(snippet.tech_stack) ? snippet.tech_stack : null;
        snipIndustry = snippet.industry ?? null;
        snipRegion = snippet.region ?? null;
      }
    } catch (error) {
      console.error("pick_personalization unexpected error", error);
    }

    const personalizationLine = snipBody ?? "";
    const systemPreamble = personalizationLine
      ? `Add this one-line personalization near the top: "${personalizationLine}".`
      : "If appropriate, include a tasteful one-line personalization.";

    const { data: styleProfile, error: styleError } = await supabase
      .from("style_profile")
      .select(
        "formality, brevity, empathy, cta_directness, para_count_avg, link_tolerance, emoji_tolerance"
      )
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (styleError && styleError.code !== "PGRST116") {
      console.warn("style_profile fetch failed", styleError);
    }

    const styleGuidance = styleProfile
      ? `Write with:
- Formality: ${
          styleProfile.formality < 0.45 ? "casual" : styleProfile.formality > 0.65 ? "formal" : "neutral"
        }
- Brevity: ${styleProfile.brevity > 0.6 ? "concise" : "moderate"}
- Empathy: ${styleProfile.empathy > 0.6 ? "acknowledging tone" : "matter-of-fact"}
- CTA: ${styleProfile.cta_directness > 0.6 ? "direct calendar CTA" : "soft reply CTA"}
- Paragraphs: ${Math.max(1, Math.round(styleProfile.para_count_avg ?? 2))} short paragraphs
- Links: ${styleProfile.link_tolerance > 0.6 ? "one link allowed" : "avoid links unless necessary"}
- Emoji: ${styleProfile.emoji_tolerance > 0.3 ? "allowed sparingly" : "do not use"}`
      : "";

    const systemMessage = [
      `You are a ${toneUsed} B2B follow-up assistant. 70–110 words, clear CTA, no fluff.`,
      styleGuidance ? styleGuidance : null,
      systemPreamble
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: `${promptMerged}\n\nThread summary:\n${threadSummary ?? "n/a"}`
        }
      ]
    });

    const draft = completion.choices?.[0]?.message?.content?.trim();

    if (!draft) {
      return new Response(JSON.stringify({ error: "No draft generated" }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }

    let eventId: string | null = null;

    if (!isPreview) {
      const dedupeKey = buildDedupeKey({
        ownerId,
        campaignId,
        label,
        prompt: promptMerged,
        vars,
        personalizationLine
      });

      const { data: saved, error: saveError } = await supabase
        .from("nudge_events")
        .insert([
          {
            owner_id: ownerId,
            campaign_id: campaignId,
            label,
            tone: toneUsed,
            is_override: isOverride,
            thread_summary: threadSummary,
            prompt_used: promptMerged,
            draft,
            dedupe_key: dedupeKey
          }
        ])
        .select("id")
        .single();

      if (saveError) {
        console.error("nudge_events insert failed", saveError);
        return new Response(JSON.stringify({ error: "Failed to persist nudge" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        });
      }

      eventId = saved?.id ?? null;

      if (eventId) {
        try {
          await supabase.from("personalization_usage").insert([
            {
              owner_id: ownerId,
              event_id: eventId,
              snippet_id: snipId,
              score: snipScore,
              is_fallback: !snipId
            }
          ]);
        } catch (usageError) {
          console.error("personalization_usage insert failed", usageError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        tone: toneUsed,
        is_override: isOverride,
        draft,
        event_id: eventId,
        cached: false,
        preview: isPreview,
        personalization_applied: Boolean(snipId),
        personalization_line: personalizationLine,
        personalization_meta: {
          role_hint: snipRole,
          tech_stack: snipTech,
          industry: snipIndustry,
          region: snipRegion,
          score: snipScore
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (error) {
    console.error("nudge-generate error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});


