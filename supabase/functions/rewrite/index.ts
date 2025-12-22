import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

type RewriteReq = {
  account_id: string;
  user_id: string;
  input: string;
  preset_id?: string | null;
  overrides?: Record<string, unknown> | null;
  variables?: Record<string, string> | null;
};

const SYS = `
You are an email rewriting assistant for cold outreach.
Strict rules:
- Preserve all double-curly tokens EXACTLY (e.g., {{first_name}}, {{company}}, {{unsubscribe.link}}).
- Do NOT invent tokens or remove existing tokens.
- Write clear, human-sounding business English.
- Obey tone, length, reading_level, and goal.
- Keep line width ~80 chars; prefer short sentences.
- Avoid spamminess: no ALL CAPS, no excessive punctuation, no sensational claims.
- Use a single CTA.
- Respect "forbidden_terms"; include all "required_terms".
- If asked to do unsafe/blocked content (e.g., harassment, illegal), refuse.
- Output only the rewritten email body, nothing else.
`;

type RewriteConfig = {
  tone: string;
  length: string;
  reading_level: string;
  goal: string;
  forbidden_terms: string[];
  required_terms: string[];
  style_notes: string;
};

function clampLength(s: string, max = 4000): string {
  return s.length > max ? s.slice(0, max) : s;
}

function extractTokens(text: string): string[] {
  const m = text.match(/\{\{[^}]+\}\}/g) || [];
  return Array.from(new Set(m));
}

function allowedTokens(tokens: string[], whitelist: Set<string>): boolean {
  return tokens.every((t) => whitelist.has(t));
}

function pickString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length) {
    return value.trim();
  }
  return fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : String(v ?? "")))
    .map((v) => v.trim())
    .filter((v) => v.length);
}

function buildUserPrompt(input: string, config: RewriteConfig): string {
  const notes = [
    `Tone: ${config.tone}`,
    `Length: ${config.length}`,
    `Reading level: ${config.reading_level}`,
    `Goal: ${config.goal}`,
    config.style_notes ? `Style notes: ${config.style_notes}` : null,
  ].filter(Boolean).join("\n");

  const req = [
    notes,
    config.required_terms.length
      ? `Must include: ${config.required_terms.join(", ")}`
      : null,
    config.forbidden_terms.length
      ? `Must avoid: ${config.forbidden_terms.join(", ")}`
      : null,
    `Rewrite this email:`,
    `---INPUT START---\n${input}\n---INPUT END---`,
  ].filter(Boolean).join("\n\n");

  return req;
}

async function getPreset(preset_id?: string | null) {
  if (!preset_id) return null;
  const { data, error } = await supabase
    .from("shared_resources")
    .select("id, kind, config")
    .eq("id", preset_id)
    .eq("kind", "rewrite_preset")
    .maybeSingle();
  if (error) throw error;
  return data;
}

function mergeConfig(
  preset: Record<string, unknown> | null,
  overrides: Record<string, unknown> | null | undefined,
): RewriteConfig {
  const base: RewriteConfig = {
    tone: "professional",
    length: "short",
    reading_level: "grade8",
    goal: "follow_up",
    forbidden_terms: [],
    required_terms: [],
    style_notes: "",
  };

  const merged = { ...base, ...(preset ?? {}), ...(overrides ?? {}) };

  return {
    tone: pickString(merged.tone, base.tone),
    length: pickString(merged.length, base.length),
    reading_level: pickString(merged.reading_level, base.reading_level),
    goal: pickString(merged.goal, base.goal),
    forbidden_terms: toStringArray((merged as any).forbidden_terms),
    required_terms: toStringArray((merged as any).required_terms),
    style_notes: pickString(merged.style_notes, ""),
  };
}

async function checkRate(user_id: string) {
  const { data, error } = await supabase
    .from("rewrite_usage_5m")
    .select("n")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) throw error;

  const n = data?.n ?? 0;
  const LIMIT = Number(Deno.env.get("REWRITE_RATE_5M") ?? 20);
  if (n >= LIMIT) throw new Error("RATE_LIMIT");
}

function violatesGuardrails(text: string, cfg: RewriteConfig): string | null {
  if (cfg.forbidden_terms.length) {
    for (const t of cfg.forbidden_terms) {
      if (t && text.toLowerCase().includes(t.toLowerCase())) {
        return `forbidden_term:${t}`;
      }
    }
  }
  if (cfg.required_terms.length) {
    for (const t of cfg.required_terms) {
      if (t && !text.toLowerCase().includes(t.toLowerCase())) {
        return `missing_required:${t}`;
      }
    }
  }
  return null;
}

type RewriteJobStatus = "queued" | "done" | "failed" | "blocked";

async function recordJob(payload: {
  account_id: string;
  user_id: string;
  input: string;
  variables: Record<string, string> | null;
  preset_id: string | null;
  config: RewriteConfig | Record<string, unknown>;
  output: string | null;
  status: RewriteJobStatus;
  reason?: string | null;
}) {
  const { error } = await supabase.from("rewrite_jobs").insert({
    account_id: payload.account_id,
    user_id: payload.user_id,
    input: payload.input,
    variables: payload.variables,
    preset_id: payload.preset_id,
    config: payload.config,
    output: payload.output,
    status: payload.status,
    reason: payload.reason ?? null,
  });
  if (error) throw error;
}

async function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  let requestBody: RewriteReq | null = null;
  let resolvedConfig: RewriteConfig | null = null;
  try {
    const parsed = (await req.json()) as RewriteReq;
    requestBody = parsed;
    const body = parsed;

    if (!body?.account_id || !body?.user_id) {
      return await jsonResponse(400, { error: "MISSING_IDS" });
    }

    await checkRate(body.user_id);

    const input = clampLength(body.input ?? "");
    if (!input.trim()) {
      return await jsonResponse(400, { error: "EMPTY_INPUT" });
    }

    const tokens = extractTokens(input);
    const { data: wl, error: wlErr } = await supabase
      .from("token_whitelist")
      .select("token");
    if (wlErr) throw wlErr;

    const white = new Set((wl ?? []).map((x: any) => x.token));

    if (!allowedTokens(tokens, white)) {
      return await jsonResponse(400, { error: "TOKEN_NOT_ALLOWED", tokens });
    }

    const preset = await getPreset(body.preset_id);
    resolvedConfig = mergeConfig(preset?.config ?? null, body.overrides);

    const userPrompt = buildUserPrompt(input, resolvedConfig);

    const resp = await openai.chat.completions.create({
      model: Deno.env.get("OPENAI_MODEL_REWRITE") ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 600,
    });

    const output = (resp.choices[0]?.message?.content ?? "").trim();

    const outTokens = extractTokens(output);
    const missing = tokens.filter((t) => !outTokens.includes(t));
    const invented = outTokens.filter((t) => !tokens.includes(t));
    const rogue = outTokens.filter((t) => !white.has(t));

    if (missing.length || invented.length || rogue.length) {
      const reason = missing.length
        ? `missing_tokens:${missing.join(",")}`
        : invented.length
        ? `invented_tokens:${invented.join(",")}`
        : `token_not_allowed:${rogue.join(",")}`;
      await recordJob({
        account_id: body.account_id,
        user_id: body.user_id,
        input,
        variables: body.variables ?? null,
        preset_id: body.preset_id ?? null,
        config: resolvedConfig,
        output: null,
        status: "blocked",
        reason,
      });

      return await jsonResponse(422, {
        error: "TOKEN_MISMATCH",
        missing,
        invented,
        rogue,
      });
    }

    const guard = violatesGuardrails(output, resolvedConfig);
    if (guard) {
      await recordJob({
        account_id: body.account_id,
        user_id: body.user_id,
        input,
        variables: body.variables ?? null,
        preset_id: body.preset_id ?? null,
        config: resolvedConfig,
        output: null,
        status: "blocked",
        reason: guard,
      });
      return await jsonResponse(422, { error: "GUARDRAIL", reason: guard });
    }

    const { data: job, error: jobErr } = await supabase
      .from("rewrite_jobs")
      .insert({
        account_id: body.account_id,
        user_id: body.user_id,
        input,
        variables: body.variables ?? null,
        preset_id: body.preset_id ?? null,
        config: resolvedConfig,
        output,
        status: "done",
      })
      .select("id, output")
      .single();

    if (jobErr) throw jobErr;

    return await jsonResponse(200, { id: job.id, output: job.output });
  } catch (e) {
    if ((e as Error)?.message === "RATE_LIMIT") {
      return await jsonResponse(429, { error: "RATE_LIMIT" });
    }

    if (requestBody?.account_id && requestBody?.user_id) {
      await recordJob({
        account_id: requestBody.account_id,
        user_id: requestBody.user_id,
        input: clampLength(requestBody.input ?? ""),
        variables: requestBody.variables ?? null,
        preset_id: requestBody.preset_id ?? null,
        config: resolvedConfig ?? requestBody.overrides ?? {},
        output: null,
        status: "failed",
        reason: (e as Error)?.message ?? "SERVER_ERROR",
      }).catch(() => {});
    }

    console.error("rewrite function error", e);
    return await jsonResponse(500, { error: "SERVER_ERROR" });
  }
});
