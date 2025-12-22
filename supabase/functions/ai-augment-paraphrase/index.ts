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
  const model_version_tag = (body.model_version_tag as string) ?? "v1.0.0";
  const n = Number.isInteger(body.n) ? Math.max(1, body.n) : 2;
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;

  if (!eval_set_id) return json({ ok: false, error: "eval_set_id required" }, 400);

  const { data: samples, error: sErr } = await supabase
    .from("ai_eval_samples")
    .select("id, gold_label, text_excerpt")
    .eq("eval_set_id", eval_set_id)
    .limit(200);
  if (sErr) return json({ ok: false, error: sErr.message }, 500);

  const out: any[] = [];
  for (const sample of samples ?? []) {
    for (let i = 0; i < n; i++) {
      const text = await paraphrase(sample.gold_label, sample.text_excerpt, temperature);
      out.push({
        source_sample_id: sample.id,
        label: sample.gold_label,
        text,
        engine: "openai",
        temperature,
        meta: { from_eval_set: eval_set_id, model_version_tag },
      });
    }
  }

  if (out.length) {
    const { error: insErr } = await supabase.from("ai_paraphrases").insert(out);
    if (insErr) return json({ ok: false, error: insErr.message }, 500);
  }

  return json({ ok: true, created: out.length });
});

async function paraphrase(label: string, text: string, temperature: number) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  const prefix: Record<string, string> = {
    positive: "Rephrase positively but concise:",
    negative: "Rephrase as a polite decline:",
    neutral: "Rephrase neutral/administrative:",
    question: "Rephrase as a clear question:",
    unsubscribe: "Rephrase as a firm unsubscribe request with no new info:",
    bounce: "Rephrase as a delivery failure notice (preserve codes if any):",
    oof: "Rephrase as an out-of-office message (keep dates if any):",
  };
  const base = prefix[label] ?? "Rephrase:";
  const tempHint = `(temp=${temperature.toFixed(2)})`;
  return `${base} ${clean} ${tempHint}`.slice(0, 4000);
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

















