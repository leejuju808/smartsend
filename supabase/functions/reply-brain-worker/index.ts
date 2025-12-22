// functions/reply-brain-worker/index.ts
// deno deploy / supabase edge

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type BrainOut = {
  intent: 'none'|'out_of_office'|'positive'|'neutral'|'negative'|'unsubscribe'|'spam'|'bounce'|'question'|'meeting_interest';
  action: 'ignore'|'archive'|'auto_unsubscribe'|'create_task'|'schedule_meeting'|'send_followup_a'|'send_followup_b'|'route_to_human'|'mark_bounce';
  confidence: number;
  reason: string;
  suggested_reply?: { subject?: string; body?: string };
  meeting?: { has_intent: boolean; times?: string[]; timezone?: string };
  entities?: { company?: string; person?: string; phone?: string; email?: string }[];
};

const SYSTEM_PROMPT = `
You are SmartSend's Adaptive Reply Brain. Given an inbound email, classify the intent and the best next action for cold-outreach workflows.

- Be cautious with "unsubscribe": only if explicit or strongly implied.
- "meeting_interest" when they express intent to book/talk.
- Map to one action. If unsure, 'route_to_human'.

Return strict JSON per schema.
`;

async function openaiJson(prompt: string, body: string, ctx: any) {
  const payload = {
    model: "gpt-4o-mini", // or your current model
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
      { role: "user", content: body },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(txt) as BrainOut;
}

async function runOnce() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Claim one job with optimistic locking
  const { data: jobs } = await sb
    .from("brain_queue")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1);

  if (!jobs || jobs.length === 0) return { taken: false };

  const job = jobs[0];
  const { email_id, account_id, id: job_id, attempt } = job;

  // Optimistic lock: update status atomically
  const { data: updated, error: lockError } = await sb
    .from("brain_queue")
    .update({ status: "running" })
    .eq("id", job_id)
    .eq("status", "queued")
    .select()
    .single();

  if (lockError || !updated) {
    // Another worker claimed it
    return { taken: false };
  }

  // Fetch email + context (handle different column name variations)
  const { data: email } = await sb.from("emails").select(`
      id, subject, body_plain, body_text, body_html, body, thread_id, message_id, account_id, lead_id, campaign_id, user_id
    `).eq("id", email_id).single();

  if (!email) {
    await sb.from("brain_queue").update({
      status: "dead",
      last_error: "Email not found"
    }).eq("id", job_id);
    return { taken: true, error: "Email not found" };
  }

  const { data: lead } = await sb.from("leads").select(`id, first_name, last_name, email, company, title`).eq("id", email?.lead_id).maybeSingle();
  const { data: policy } = await sb.from("reply_brain_policy").select("*").eq("account_id", account_id).maybeSingle();
  const min_conf = policy?.min_confidence ?? 0.65;

  const text = email?.body_plain || email?.body_text || email?.body || email?.body_html || "";
  const userPrompt = `
SUBJECT: ${email?.subject ?? ""}
LEAD: ${lead?.first_name ?? ""} ${lead?.last_name ?? ""} (${lead?.title ?? ""} at ${lead?.company ?? ""})
THREAD CONTEXT: Keep replies short & sales-safe. Only propose auto actions if confidence >= ${min_conf}.

Return JSON with keys: intent, action, confidence, reason, suggested_reply?, meeting?, entities?
`;

  try {
    const started = performance.now();
    const out = await openaiJson(userPrompt, text, {});
    const latency = Math.round(performance.now() - started);

    // Persist model (ensure a default model row exists per account)
    const { data: model } = await sb.from("reply_brain_models")
      .select("id").eq("account_id", account_id).eq("is_active", true).limit(1).maybeSingle();
    
    let model_id = model?.id;
    if (!model_id) {
      const { data: newModel } = await sb.from("reply_brain_models").insert({
        account_id, version: 1, name: "default", system_prompt: SYSTEM_PROMPT
      }).select("id").single();
      model_id = newModel?.id;
    }

    const inputs = {
      subject: email?.subject, 
      body_preview: text.slice(0, 4000),
      lead, 
      campaign_id: email?.campaign_id
    };

    const { data: inf, error: insErr } = await sb.from("reply_brain_inferences").insert({
      account_id, 
      model_id, 
      email_id, 
      message_id: email?.message_id,
      inputs, 
      output: out, 
      intent: out.intent, 
      action: out.action,
      confidence: out.confidence, 
      latency_ms: latency, 
      score: out.confidence
    }).select("id").single();

    if (insErr) throw insErr;

    // Decide automation vs route
    let autoApplied = false;
    if (out.confidence >= min_conf) {
      if (out.action === "auto_unsubscribe") {
        // Mark contact unsubscribed & stop sequences
        await sb.rpc("unsubscribe_lead_by_email_id", { p_email_id: email_id }).catch(()=>{});
        autoApplied = true;
      } else if (out.action === "mark_bounce") {
        await sb.rpc("mark_bounce_by_email_id", { p_email_id: email_id }).catch(()=>{});
        autoApplied = true;
      } else if (out.action === "send_followup_a" || out.action === "send_followup_b") {
        await sb.rpc("queue_followup_from_inference", { 
          p_inference_id: inf.id, 
          p_variant: out.action 
        }).catch(()=>{});
        autoApplied = true;
      } else if (out.action === "schedule_meeting" && out.meeting?.has_intent) {
        await sb.rpc("create_meeting_task_from_inference", { p_inference_id: inf.id }).catch(()=>{});
      }
    }

    await sb.from("brain_queue").update({
      status: "done", 
      last_error: autoApplied ? 'auto' : null, 
      attempt: attempt + 1
    }).eq("id", job_id);

    return { taken: true, email_id, out, autoApplied };
  } catch (e) {
    const next = new Date(Date.now() + Math.min(60_000 * (attempt + 1), 15 * 60_000));
    await sb.from("brain_queue").update({
      status: attempt >= 5 ? "dead" : "queued",
      attempt: attempt + 1,
      run_after: next.toISOString(),
      last_error: String(e)
    }).eq("id", job_id);
    return { taken: true, error: String(e) };
  }
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response("forbidden", { status: 403 });
  }
  const result = await runOnce();
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});

