import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type Supabase = ReturnType<typeof createClient>;
type RouteReason = "active" | "canary" | "fallback";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

async function pickModelForRequest(supabase: Supabase): Promise<{ model: string; reason: RouteReason }> {
  const { data: active } = await supabase
    .from("ai_active_models")
    .select("*")
    .eq("eval_set", "reply_classifier")
    .maybeSingle();

  if (!active) {
    return { model: "replyclf_v0.0.1", reason: "fallback" };
  }

  const { active_model, canary_model, canary_percent } = active;

  if (canary_model && canary_percent > 0) {
    const roll = Math.floor(Math.random() * 100) + 1; // 1..100
    if (roll <= canary_percent) {
      return { model: canary_model, reason: "canary" };
    }
  }

  return { model: active_model, reason: "active" };
}

export async function POST(req: Request) {
  const body = await req.json();
  const { message_id, text, lead_key, request_id, sample_id } = body;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { model: versionTag, reason } = await pickModelForRequest(supabase);

  const { data: mv } = await supabase
    .from("ai_model_versions")
    .select("*")
    .eq("version_tag", versionTag)
    .maybeSingle();

  if (!mv) {
    return NextResponse.json({ ok: false, error: "model version not found" }, { status: 400 });
  }

  const t0 = Date.now();
  const r = await fetch(process.env.NEXT_PUBLIC_BASE_URL + "/api/ai/_internal/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.INTERNAL_TOKEN! },
    body: JSON.stringify({ text, model_version: versionTag, model: mv.model }),
  });
  const pred = await r.json();
  const latency = Date.now() - t0;

  await supabase.from("ai_inference_logs").insert({
    message_id,
    route: versionTag,
    pred_label: pred.label,
    pred_confidence: pred.confidence,
    latency_ms: latency,
    model_version_id: mv.id,
    meta: { routeType: reason },
  });

  let threshold: number | null = null;
  if (pred?.label) {
    const { data: thr } = await supabase
      .from("ai_model_thresholds")
      .select("threshold")
      .eq("model_version", versionTag)
      .eq("label", pred.label)
      .maybeSingle();
    threshold = thr?.threshold ?? null;
  }

  const livePayload = {
    request_id: request_id ?? message_id ?? lead_key ?? crypto.randomUUID(),
    model_version: versionTag,
    eval_set: "reply_classifier",
    route: reason,
    predicted_label: pred?.label ?? null,
    score: typeof pred?.confidence === "number" ? pred.confidence : null,
    threshold,
    sample_id: sample_id ?? null,
    text_preview: typeof text === "string" ? text.slice(0, 280) : null,
  };

  await fetch(`${FUNCTIONS_BASE}/log-inference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(livePayload),
  }).catch(() => undefined);

  const inTok = pred?.usage?.input_tokens ?? 0;
  const outTok = pred?.usage?.output_tokens ?? 0;
  const cost = (inTok * 0.0000005 + outTok * 0.0000015).toFixed(4);
  if (inTok || outTok) {
    await supabase.from("ai_cost_ledger").insert({
      provider: "openai",
      model: mv.model,
      usage_type: "online",
      calls: 1,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_usd: cost,
    });
  }

  const post = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/ai-postprocess", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      message_id,
      text,
      raw_label: pred.label,
      raw_confidence: pred.confidence,
      model_version_tag: versionTag,
    }),
  });
  const pj = await post.json();

  return NextResponse.json({
    ok: true,
    label: pj.label,
    decided_by: pj.decided_by,
    version: versionTag,
    confidence: pred.confidence,
  });
}
