// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch (_err) {
    return json({ ok: false, error: "invalid payload" }, 400);
  }

  const eval_set_id = body.eval_set_id as string | undefined;
  const model_version_id = body.model_version_id as string | undefined;
  if (!eval_set_id || !model_version_id) {
    return json({ ok: false, error: "eval_set_id and model_version_id required" }, 400);
  }

  const { data: errs, error: eErr } = await supabase
    .from("v_ai_errors")
    .select("*")
    .eq("eval_set_id", eval_set_id);
  if (eErr) return json({ ok: false, error: eErr.message }, 500);

  const rows: any[] = [];
  for (const e of errs ?? []) {
    const tagged = tagBucket(e.gold_label, e.pred_label, e.text_excerpt);
    rows.push({
      eval_set_id,
      sample_id: e.sample_id,
      model_version_id,
      gold_label: e.gold_label,
      pred_label: e.pred_label,
      bucket: tagged.bucket,
      details: tagged.details,
    });
  }

  if (rows.length) {
    const { error: insErr } = await supabase.from("ai_eval_error_buckets").insert(rows, { count: "exact" });
    if (insErr) return json({ ok: false, error: insErr.message }, 500);
  }

  return json({ ok: true, inserted: rows.length });
});

function tagBucket(gold: string, pred: string, text: string) {
  const original = text || "";
  const lower = original.toLowerCase();
  const details: Record<string, unknown> = {};

  if (lower.includes("out of office") || lower.includes("automatic reply") || /i am (?:off|away)/.test(lower)) {
    return { bucket: "OOF_signature", details };
  }
  if (/unsubscribe|remove me|opt[- ]?out|do not contact/.test(lower)) {
    return { bucket: "Unsub_disguised", details };
  }
  if (/^fwd:|forwarded message/i.test(original) || /-----original message-----/i.test(original)) {
    return { bucket: "Forward_noise", details };
  }
  if (/on .* wrote:/.test(original) || /> .*@.*\..*/.test(original)) {
    return { bucket: "Quoted_thread_confusion", details };
  }
  if (/[áéíóúñüßàèìòùçğşžйω汉]/.test(original)) {
    return { bucket: "Non_english", details };
  }
  if (/(maybe|not sure|circle back)/.test(lower) && gold === "negative") {
    return { bucket: "Neg_soft", details };
  }
  if (/(book|schedule|calendar|availability)/.test(lower) && gold === "question") {
    return { bucket: "Ambiguous_meeting", details };
  }
  if (/^(ok|thanks|thx|got it)[\.\!]?$/m.test(lower)) {
    return { bucket: "Short_ack", details };
  }

  return { bucket: "Other", details: { gold, pred } };
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

















