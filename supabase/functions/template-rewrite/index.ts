// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.21.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const openAiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: openAiKey });

type Constraints = {
  length_words?: { min: number; max: number };
  cta?: "direct" | "soft";
  reading_level?: "grade7" | "grade10" | "professional";
  ban_phrases?: string[];
  require_lines?: string[];
  para_count?: { min: number; max: number };
  style_overrides?: Partial<Record<"formality" | "brevity" | "empathy" | "cta_directness", number>>;
};

type RewritePresetRow = {
  id: string;
  owner_id: string;
  name: string;
  label: string;
  tone: string;
  constraints: Constraints | null;
  is_active: boolean;
};

type StyleProfileRow = {
  formality?: number | null;
  brevity?: number | null;
  empathy?: number | null;
  cta_directness?: number | null;
  para_count_avg?: number | null;
};

function guardMergeTags(text: string) {
  const bad = text.match(/\{\{[^}\s]+\s+[^}]+\}\}/g);
  if (bad) {
    throw new Error(`Invalid merge-tags: ${bad.join(", ")}`);
  }
}

function brevityFlag(b: number) {
  return b > 0.6 ? "concise" : "moderate";
}

function styleBlock(style: StyleProfileRow | null, constraints: Constraints) {
  const formality = constraints.style_overrides?.formality ?? style?.formality ?? 0.5;
  const brevity = constraints.style_overrides?.brevity ?? style?.brevity ?? 0.5;
  const empathy = constraints.style_overrides?.empathy ?? style?.empathy ?? 0.5;
  const ctaDirect = constraints.style_overrides?.cta_directness ?? style?.cta_directness ?? 0.5;

  const paras = Math.max(
    1,
    Math.min(
      5,
      Math.round(
        constraints.para_count?.min ??
          constraints.para_count?.max ??
          style?.para_count_avg ??
          2
      )
    )
  );

  const readMap: Record<string, string> = {
    grade7: "~7th-grade",
    grade10: "~10th-grade",
    professional: "professional"
  };

  const reading = readMap[constraints.reading_level ?? "professional"];

  return `Style:
- ${formality < 0.45 ? "casual" : formality > 0.65 ? "formal" : "neutral"} tone
- ${brevityFlag(brevity)} length
- Empathy: ${empathy > 0.6 ? "acknowledging" : "matter-of-fact"}
- CTA: ${constraints.cta === "direct" || ctaDirect > 0.6 ? "direct calendar CTA" : "soft reply CTA"}
- ${paras} short paragraphs
- Reading level: ${reading}`;
}

async function offlineScore(ownerId: string, draft: string, label: string) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/nudge-offline-eval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {})
      },
      body: JSON.stringify({ owner_id: ownerId, sample_size: 20, label })
    });
    const payload = await response.json().catch(() => ({}));
    const avg = typeof payload?.avg === "number" ? payload.avg : 0.5;
    const wc = draft.trim().split(/\s+/).filter(Boolean).length;
    const cta = /(schedule|book|calendar|reply|meet)/i.test(draft) ? 0.1 : -0.1;
    const len = wc >= 70 && wc <= 110 ? 0.1 : -0.1;
    return Math.max(0, Math.min(1, avg + cta + len));
  } catch {
    const wc = draft.trim().split(/\s+/).filter(Boolean).length;
    const len = wc >= 70 && wc <= 110 ? 0.05 : -0.05;
    return Math.max(0, Math.min(1, 0.5 + len));
  }
}

async function loadPreset(ownerId: string, label: string, tone: string, presetId?: string | null) {
  if (presetId) {
    const { data, error } = await supabase
      .from("rewrite_presets")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", presetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Preset not found");
    return data as RewritePresetRow;
  }

  const { data, error } = await supabase
    .from("rewrite_presets")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("label", label)
    .eq("tone", tone)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as RewritePresetRow | null) ?? null;
}

async function loadStyle(ownerId: string) {
  const { data } = await supabase
    .from("style_profile")
    .select("formality,brevity,empathy,cta_directness,para_count_avg")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return (data as StyleProfileRow | null) ?? null;
}

function normalizeConstraints(preset: RewritePresetRow | null): Constraints {
  const defaults: Constraints = {
    length_words: { min: 70, max: 110 },
    cta: "direct",
    reading_level: "professional",
    ban_phrases: ["guarantee", "risk-free"],
    require_lines: ["unsubscribe_footer", "postal_address"],
    para_count: { min: 1, max: 2 }
  };
  if (!preset?.constraints) return defaults;
  return {
    ...defaults,
    ...(preset.constraints as Constraints)
  };
}

async function upsertRun(payload: {
  ownerId: string;
  presetId: string | null;
  sourcePrompt: string;
  variant: Record<string, { prompt: string; score: number }>;
}) {
  const { data, error } = await supabase
    .from("rewrite_runs")
    .insert([
      {
        owner_id: payload.ownerId,
        preset_id: payload.presetId,
        source_prompt: payload.sourcePrompt,
        variant: payload.variant
      }
    ])
    .select("id, variant")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const ownerId = String(body?.owner_id ?? "").trim();
    const label = String(body?.label ?? "").trim();
    const tone = String(body?.tone ?? "").trim();
    const sourcePrompt = String(body?.source_prompt ?? "").trim();
    const presetId = body?.preset_id ? String(body.preset_id) : null;

    if (!ownerId || !label || !tone || !sourcePrompt) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    guardMergeTags(sourcePrompt);

    const preset = await loadPreset(ownerId, label, tone, presetId);
    const constraints = normalizeConstraints(preset);
    const style = await loadStyle(ownerId);

    const systemPrompt =
      "You rewrite B2B follow-up PROMPTS (instructions to a downstream copy model), not final emails.\n" +
      "Keep all {{merge_tags}} unchanged. Obey constraints strictly. Output JSON with keys v1,v2,v3. " +
      "Each value must be a single-paragraph instruction (<= 120 words).";

    const constraintLines = [
      `Constraints:`,
      `- Words: ${(constraints.length_words?.min ?? 70)}-${(constraints.length_words?.max ?? 110)}`,
      `- CTA: ${constraints.cta ?? "direct or soft if appropriate"}`,
      `- Para count target: ${(constraints.para_count?.min ?? 1)}-${(constraints.para_count?.max ?? 3)}`,
      `- Ban phrases: ${(constraints.ban_phrases ?? []).join(", ") || "none"}`,
      styleBlock(style, constraints)
    ];

    const userPrompt = [
      `Baseline prompt:\n"""${sourcePrompt}"""`,
      "",
      `Rewrite into 3 alternative prompts that vary specificity and CTA while staying ${tone}.`,
      constraintLines.join("\n")
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const rawContent = completion.choices?.[0]?.message?.content ?? "{}";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}$/);
    const jsonPayload = jsonMatch ? jsonMatch[0] : rawContent;

    let parsed: any = {};
    try {
      parsed = JSON.parse(jsonPayload);
    } catch (_err) {
      throw new Error("Failed to parse model JSON output");
    }

    const candidates = ["v1", "v2", "v3"].map((key) => {
      const prompt = typeof parsed?.[key] === "string" ? parsed[key] : "";
      return [key, prompt.trim()] as const;
    });

    const missing = candidates.find(([, prompt]) => !prompt);
    if (missing) {
      throw new Error(`Variant ${missing[0]} missing from model response`);
    }

    candidates.forEach(([, prompt]) => guardMergeTags(prompt));

    const scores = await Promise.all(
      candidates.map(([, prompt]) => offlineScore(ownerId, prompt, label))
    );

    const variant = Object.fromEntries(
      candidates.map(([key, prompt], index) => [
        key,
        { prompt, score: scores[index] }
      ])
    );

    const run = await upsertRun({
      ownerId,
      presetId: preset?.id ?? null,
      sourcePrompt,
      variant
    });

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: run?.id,
        variant: run?.variant ?? variant
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("template-rewrite error", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unexpected error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }
});

