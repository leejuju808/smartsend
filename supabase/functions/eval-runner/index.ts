import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PR = Record<string, number>;
const uniq = <T,>(a: T[]) => Array.from(new Set(a));

function metrics(y: string[], yhat: string[]) {
  const labels = uniq([...y, ...yhat]).sort();
  const cm: Record<string, Record<string, number>> = {};
  for (const g of labels) cm[g] = Object.fromEntries(labels.map(l => [l, 0]));
  for (let i=0;i<y.length;i++) cm[y[i]][yhat[i]]++;

  const prec: PR = {}, rec: PR = {};
  let f1sum = 0, k = 0, acc = 0;
  for (const l of labels) {
    const tp = cm[l][l];
    const fp = labels.reduce((s,a)=> s + (a===l ? 0 : cm[a][l]), 0);
    const fn = labels.reduce((s,a)=> s + (a===l ? 0 : cm[l][a]), 0);
    const p = tp ? tp / (tp + fp) : 0;
    const r = tp ? tp / (tp + fn) : 0;
    const f1 = (p+r) ? 2*p*r/(p+r) : 0;
    prec[l] = p; rec[l] = r; f1sum += f1; k++;
    acc += tp;
  }
  return {
    labels,
    accuracy: acc / y.length,
    macro_f1: f1sum / (k || 1),
    confusion: cm,
    precision: prec,
    recall: rec
  };
}

// Rule-based detectors (from reply-detect/index.ts)
function detectReplyKind(text: string): { label: string; confidence: number } {
  const t = (text || "").toLowerCase();
  
  if (/unsubscribe|remove me|opt out|opt-out|stop emailing|stop sending/.test(t)) {
    return { label: 'unsubscribe', confidence: 0.98 };
  }
  if (/not interested|no thanks|stop contacting|don't contact|not looking|not now|not at this time/.test(t)) {
    return { label: 'negative', confidence: 0.85 };
  }
  if (/(schedule|book|meet|call|zoom|teams|calendly|meeting|coffee|chat)/.test(t) && 
      /(next|tomorrow|\bmon|\btue|\bwed|\bthu|\bfri|\bsat|\bsun|\d{1,2}(:\d{2})?\s?(am|pm)?|available|free)/.test(t)) {
    return { label: 'meeting', confidence: 0.80 };
  }
  if (/(mailer-daemon|delivery[ -]?status|bounce|undeliverable|returned mail|delivery failure)/.test(t)) {
    return { label: 'bounce', confidence: 0.99 };
  }
  if (/(out of office|auto.?reply|vacation|away|ooo|out until|back on|returning)/.test(t)) {
    return { label: 'ooo', confidence: 0.95 };
  }
  if (/(yes|interested|sounds good|let's|let us|sure|definitely|absolutely|love to|would like)/.test(t)) {
    return { label: 'positive', confidence: 0.75 };
  }
  return { label: 'neutral', confidence: 0.55 };
}

function detectOOO(text: string): { label: string; confidence: number } {
  const t = (text || "").toLowerCase();
  if (/(out of office|auto.?reply|vacation|away|ooo|out until|back on|returning)/.test(t)) {
    return { label: 'ooo', confidence: 0.95 };
  }
  return { label: 'not_ooo', confidence: 0.60 };
}

function detectMeetingIntent(text: string): { label: string; confidence: number } {
  const t = (text || "").toLowerCase();
  if (/(schedule|book|meet|call|zoom|teams|calendly|meeting|coffee|chat)/.test(t) && 
      /(next|tomorrow|\bmon|\btue|\bwed|\bthu|\bfri|\bsat|\bsun|\d{1,2}(:\d{2})?\s?(am|pm)?|available|free)/.test(t)) {
    return { label: 'has_intent', confidence: 0.80 };
  }
  return { label: 'no_intent', confidence: 0.60 };
}

function detectTone(text: string): { label: string; confidence: number } {
  const t = (text || "").toLowerCase();
  // Simple heuristic - can be replaced with LLM call
  if (/(thanks|thank you|appreciate|grateful|please|kindly)/.test(t) && 
      !/(lol|haha|!{2,})/.test(t)) {
    return { label: 'formal', confidence: 0.70 };
  }
  if (/(lol|haha|!{2,}|cheers|:)|\bhey\b|\bhi\b/.test(t)) {
    return { label: 'casual', confidence: 0.70 };
  }
  if (/(urgent|asap|immediately|must|need to)/.test(t)) {
    return { label: 'assertive', confidence: 0.65 };
  }
  return { label: 'neutral', confidence: 0.50 };
}

// LLM-based detection (optional, can be enhanced with prompt packs)
async function detectWithLLM(text: string, task: string, model: string = 'gpt-4o-mini'): Promise<{ label: string; confidence: number }> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  let prompt = "";
  if (task === 'reply_kind') {
    prompt = `Classify this email reply into one of: positive, neutral, negative, meeting, unsubscribe, bounce, ooo. Return JSON: {"label": "...", "confidence": 0.0..1.0}\n\nText: ${text.slice(0, 2000)}`;
  } else if (task === 'ooo') {
    prompt = `Is this an out-of-office auto-reply? Return JSON: {"label": "ooo" or "not_ooo", "confidence": 0.0..1.0}\n\nText: ${text.slice(0, 2000)}`;
  } else if (task === 'meeting_intent') {
    prompt = `Does this email express intent to schedule a meeting? Return JSON: {"label": "has_intent" or "no_intent", "confidence": 0.0..1.0}\n\nText: ${text.slice(0, 2000)}`;
  } else if (task === 'tone') {
    prompt = `Classify the tone of this email into one of: formal, casual, humorous, assertive. Return JSON: {"label": "...", "confidence": 0.0..1.0}\n\nText: ${text.slice(0, 2000)}`;
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
    }),
  });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    return {
      label: parsed.label || 'neutral',
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5))
    };
  } catch (err) {
    console.error("LLM detection failed:", err);
    throw err;
  }
}

serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { eval_set_id, pack_id, pack_version, model, params } = await req.json().catch(() => ({}));

  if (!eval_set_id) {
    return new Response(JSON.stringify({ error: "eval_set_id required" }), { status: 400, headers: { "Content-Type": "application/json" }});
  }

  // Load eval set and items
  const { data: evalSet } = await sb.from("eval_sets").select("id, task").eq("id", eval_set_id).single();
  if (!evalSet) {
    return new Response(JSON.stringify({ error: "eval set not found" }), { status: 404, headers: { "Content-Type": "application/json" }});
  }

  const { data: items } = await sb.from("eval_items").select("id, text, gold_label").eq("eval_set_id", eval_set_id);
  if (!items?.length) {
    return new Response(JSON.stringify({ error: "empty set" }), { status: 400, headers: { "Content-Type": "application/json" }});
  }

  const task = evalSet.task;
  const useModel = model || 'rules';
  const predictions: Array<{ item_id: string; pred_label: string; confidence: number }> = [];

  // Run predictions
  for (const item of items) {
    let pred: { label: string; confidence: number };
    
    try {
      if (useModel === 'rules' || useModel.startsWith('rule')) {
        // Use rule-based detection
        if (task === 'reply_kind') {
          pred = detectReplyKind(item.text);
        } else if (task === 'ooo') {
          pred = detectOOO(item.text);
        } else if (task === 'meeting_intent') {
          pred = detectMeetingIntent(item.text);
        } else if (task === 'tone') {
          pred = detectTone(item.text);
        } else {
          pred = { label: 'neutral', confidence: 0.5 };
        }
      } else {
        // Use LLM
        pred = await detectWithLLM(item.text, task, useModel);
      }
      
      predictions.push({
        item_id: item.id,
        pred_label: pred.label,
        confidence: pred.confidence
      });
    } catch (err) {
      console.error(`Prediction failed for item ${item.id}:`, err);
      predictions.push({
        item_id: item.id,
        pred_label: 'error',
        confidence: 0
      });
    }
  }

  // Calculate metrics
  const y = items.map((i: any) => i.gold_label);
  const yhat = predictions.map(p => p.pred_label);
  const m = metrics(y, yhat);

  // Write run
  const { data: run, error: runErr } = await sb.from("eval_runs").insert({
    eval_set_id,
    pack_kind: 'detector',
    pack_id: pack_id || null,
    pack_version: pack_version || null,
    model: useModel,
    params: params || null,
    macro_f1: m.macro_f1,
    accuracy: m.accuracy,
    precision: m.precision,
    recall: m.recall,
    confusion: m.confusion
  }).select("id").single();

  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message || "failed to create run" }), { status: 500, headers: { "Content-Type": "application/json" }});
  }

  // Write predictions
  const predsToInsert = predictions.map((p, i) => ({
    run_id: run.id,
    item_id: p.item_id,
    pred_label: p.pred_label,
    confidence: p.confidence,
    correct: y[i] === p.pred_label
  }));

  const { error: predErr } = await sb.from("eval_predictions").insert(predsToInsert);
  if (predErr) {
    console.error("Failed to insert predictions:", predErr);
  }

  return new Response(JSON.stringify({ 
    ok: true, 
    run_id: run.id, 
    metrics: m,
    n_items: items.length,
    n_predictions: predictions.length
  }), { 
    headers: { "Content-Type": "application/json" }
  });
});
