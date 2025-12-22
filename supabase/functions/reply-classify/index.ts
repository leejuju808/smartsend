import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

type Label = "positive"|"neutral"|"oos"|"bounce"|"ooo"|"meeting_intent";

Deno.serve(async (req) => {
  const supa = createClient(url, key);
  try {
    const { message_id } = await req.json();

    // Load message
    const { data: m, error } = await supa.from("messages")
      .select("id, thread_id, account_id, lead_id, subject, body_text, body_html, label")
      .eq("id", message_id).single();
    if (error) return json({ ok:false, error: error.message }, 404);
    const text = pickText(m.body_text, m.body_html);

    // 1) Rules pass
    const rules = ruleClassify(text, m.subject || "");

    // 2) LLM fallback (only if rules inconclusive or low confidence)
    let llm:any = {};
    if (!rules.label || rules.conf < 0.8) {
      llm = await llmClassify(text, m.subject || "");
    }

    // 3) Ensemble
    const { label, conf, source } = ensemble(rules, llm);

    // Persist on message + thread
    await supa.from("messages").update({
      label: label as any,
      label_confidence: conf,
      clf_source: source,
      clf_trace: { rules, llm }
    }).eq("id", message_id);

    await supa.from("threads").update({
      last_inbound_label: label as any,
      updated_at: new Date().toISOString()
    }).eq("id", m.thread_id);

    // 4) Hooks (fire-and-forget)
    triggerHooks(supa, { msg: m, label, conf, text }).catch(()=>{});

    return json({ ok:true, label, confidence: conf, source, rules, llm });
  } catch (e) {
    return json({ ok:false, error: String(e) }, 500);
  }
});

/* ---------------- helpers ---------------- */

function pickText(plain?: string|null, html?:string|null){
  if (plain && plain.trim().length > 10) return plain;
  return (html||"").replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').trim();
}

function ruleClassify(text:string, subject:string){
  const t = (text||"").toLowerCase();
  const s = (subject||"").toLowerCase();
  const hit = (re:RegExp)=> re.test(t) || re.test(s);

  // bounce
  if (hit(/\b(user|address).*(unknown|not\s?found|doesn'?t exist)/) || hit(/\b(mail delivery|delivery status notification|5\.\d\.\d)\b/))
    return { label: "bounce", conf: 0.98, why: "hard-bounce-phrases" };

  // OOO
  if (hit(/\b(out of office|automatic reply|away until|on leave|vacation)\b/))
    return { label: "ooo", conf: 0.95, why: "ooo-phrases" };

  // meeting intent (slots, times, calendars)
  if (hit(/\b(?:meet|call|chat)\b.*\b(?:today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday)\b/)
   || hit(/\b(?:15|20|30|45|60)[- ]?(min|minutes)\b/)
   || hit(/\bcalendly\.|cal\.com\/|zoom\.us\/|google\.com\/calendar\/\b/))
    return { label: "meeting_intent", conf: 0.9, why: "time-slots-or-cal-link" };

  // positive
  if (hit(/\b(?:yes|sounds good|interested|let'?s (talk|chat|connect)|sure|go ahead|okay|ok)\b/))
    return { label: "positive", conf: 0.85, why: "affirmative-phrases" };

  // oos (out of scope / not interested / unsubscribe)
  if (hit(/\bnot (interested|a fit)\b/) || hit(/\bunsubscribe|remove me|stop emailing\b/))
    return { label: "oos", conf: 0.9, why: "decline-phrases" };

  // neutral fallback
  if (t.length > 0) return { label: "neutral", conf: 0.6, why: "rules-default" };

  return { label: null, conf: 0.0, why: "empty" };
}

async function llmClassify(text:string, subject:string){
  if (!openaiKey) return {};
  const prompt = [
    "Classify the email reply into one label:",
    "positive | neutral | oos | bounce | ooo | meeting_intent.",
    "Return JSON: {label, confidence (0..1), rationale}.",
    "Definitions:",
    "- positive: affirmative interest but no specific time.",
    "- meeting_intent: proposes times OR asks to schedule OR includes calendar/zoom link.",
    "- ooo: automatic vacation/away message.",
    "- bounce: delivery failure/system bounce.",
    "- oos: out-of-scope/decline/unsubscribe.",
    "- neutral: questions/clarifications/other.",
    "",
    "Subject:\n" + subject,
    "Body:\n```" + text.slice(0, 6000) + "```"
  ].join("\n");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "Authorization":`Bearer ${openaiKey}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
  });
  try {
    const j = await r.json();
    return JSON.parse(j.choices?.[0]?.message?.content || "{}");
  } catch { return {}; }
}

function ensemble(rules:any, llm:any): {label:Label, conf:number, source:string}{
  // priority: bounce/ooo from rules (very deterministic)
  if (rules.label === "bounce" || rules.label === "ooo") return { label: rules.label, conf: rules.conf, source: "rules" };

  // If both agree → average conf
  if (llm.label && rules.label && llm.label === rules.label) {
    const c = Math.min(0.99, (Number(llm.confidence||0.7)+Number(rules.conf||0.6))/2);
    return { label: llm.label, conf: c, source: "ensemble" };
  }

  // Meeting intent: if rules saw times/links, keep; else trust LLM if conf ≥ 0.75
  if (rules.label === "meeting_intent") return { label: "meeting_intent", conf: rules.conf, source: "rules" };
  if (llm.label === "meeting_intent" && Number(llm.confidence||0) >= 0.75) return { label: "meeting_intent", conf: Number(llm.confidence), source: "llm" };

  // Otherwise prefer LLM if conf ≥ 0.7 else rules
  if (llm.label && Number(llm.confidence||0) >= 0.7) return { label: llm.label, conf: Number(llm.confidence), source: "llm" };
  if (rules.label) return { label: rules.label, conf: rules.conf, source: "rules" };
  return { label: "neutral", conf: 0.55, source: "fallback" };
}

async function triggerHooks(supa:any, ctx:{msg:any; label:Label; conf:number; text:string}){
  const { msg, label, conf } = ctx;

  // 1) Auto-pause followups on positive/meeting/bounce/ooo/oos
  if (["positive","meeting_intent","bounce","ooo","oos"].includes(label)) {
    const pauseFor = label === "meeting_intent" ? "7 days"
                    : label === "positive" ? "14 days"
                    : label === "oos" ? "365 days"
                    : "3 days"; // bounce/ooo
    await supa.from("threads").update({ paused_until: new Date(Date.now()+ms(pauseFor)).toISOString() }).eq("id", msg.thread_id);
  }

  // 2) Nudge routing: if neutral or positive<0.75, drop a gentle nudge preset task
  if (label === "neutral" || (label === "positive" && conf < 0.75)) {
    await enqueueNudge(supa, msg.thread_id, msg.lead_id).catch(()=>{});
  }

  // 3) Meeting extractor + signature parser (Blocks 88 & 93)
  fetch(Deno.env.get("MEETING_EXTRACT_URL")!, postJson({ message_id: msg.id })).catch(()=>{});
  fetch(Deno.env.get("SIGNATURE_PARSE_URL")!, postJson({ message_id: msg.id })).catch(()=>{});
}

async function enqueueNudge(supa:any, threadId:string, leadId:string){
  // insert into your jobs table or shared_resources-powered preset queue
  await supa.from("jobs").insert({
    kind: "nudge_followup",
    payload: { thread_id: threadId, lead_id: leadId, preset: "Soft Bump" },
    run_at: new Date(Date.now() + 6*60*60*1000).toISOString()  // 6h later
  }).catch(()=>{});
}

function ms(s:string){ const m = s.match(/(\d+)\s*(day|hour|minute|d|h|m)s?/i); if(!m) return 0;
  const n = Number(m[1]); const u = m[2].toLowerCase()[0]; return u==='d'? n*864e5 : u==='h'? n*36e5 : n*6e4; }
function postJson(body:any){ return { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) } }
function json(b:any,s=200){ return new Response(JSON.stringify(b), { status:s, headers:{ "Content-Type":"application/json" } }); }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!openaiKey) {
  console.warn("OPENAI_API_KEY is not configured; LLM fallback will fail.");
}

const THREAD_INTEL_URL = Deno.env.get("THREAD_INTEL_URL");
const SIGNATURE_PARSE_URL = Deno.env.get("SIGNATURE_PARSE_URL");
const BOUNCE_INTEL_URL = Deno.env.get("BOUNCE_INTEL_URL");
const supabaseOptions = { auth: { persistSession: false } as const };

type Label = "positive" | "neutral" | "oos" | "bounce" | "ooo" | "meeting_intent";

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl!, supabaseKey!, supabaseOptions);
  try {
    const { message_id } = await req.json();
    if (!message_id) {
      return json({ ok: false, error: "missing_message_id" }, 400);
    }

    const { data: msg, error: msgError } = await supa
      .from("messages")
      .select(
        "id, account_id, thread_id, lead_id, direction, from_email, to_email, subject, body_text, body_html, received_at"
      )
      .eq("id", message_id)
      .maybeSingle();

    if (msgError) {
      console.error("Failed to load message", msgError);
      return json({ ok: false, error: "message_lookup_failed" }, 500);
    }

    if (!msg || msg.direction !== "inbound") {
      return json({ ok: false, error: "not_inbound_or_missing" }, 400);
    }

    const text = normalizeText(msg.body_text, msg.body_html);
    const domain = (msg.from_email || "").split("@")[1]?.toLowerCase() || "";

    // 1) RULES
    const rules = applyRules(text, msg.subject ?? undefined);
    if (rules?.label) {
      await persistResult(supa, msg, rules.label, rules.confidence, "rules", { rules });
      await triggerActions(supa, msg, rules.label);
      await updateReputation(supa, msg, rules.label, Math.min(0.95, rules.confidence));
      return json({ ok: true, label: rules.label, via: "rules" });
    }

    // 2) Reputation cache
    const rep = await loadReputation(supa, msg.account_id, domain, msg.thread_id);
    if (rep?.label && rep.confidence >= 0.85) {
      await persistResult(supa, msg, rep.label as Label, rep.confidence, "reputation", { rep });
      await triggerActions(supa, msg, rep.label as Label);
      return json({ ok: true, label: rep.label, via: "reputation" });
    }

    // 3) LLM fallback
    const llm = await llmClassify(text);
    await persistResult(supa, msg, llm.label as Label, llm.confidence, "llm", { llm });
    await triggerActions(supa, msg, llm.label as Label);
    await updateReputation(supa, msg, llm.label as Label, llm.confidence);

    return json({ ok: true, label: llm.label, via: "llm" });
  } catch (err) {
    console.error("reply-classify error", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function applyRules(text: string, subject?: string): { label: Label; confidence: number } | null {
  const t = text.toLowerCase();
  const s = (subject || "").toLowerCase();

  if (/(5\.1\.1|mailbox unavailable|user unknown|delivery has failed|undeliverable|550 |552 |421 )/.test(text)) {
    return { label: "bounce", confidence: 0.98 };
  }

  if (/(out of office|auto[-\s]?reply|away until|i am on leave|vacation until|back on \d{1,2}\/\d{1,2})/i.test(text)) {
    return { label: "ooo", confidence: 0.97 };
  }

  if (/(not the right person|not responsible|try hr|please contact|reach out to.*(team|department)|no longer with the company)/i.test(text)) {
    return { label: "oos", confidence: 0.9 };
  }

  if (/(let.?s (talk|chat|connect)|schedule (a )?(call|meeting)|can you send a (calendar|calendly)|i'm available (tomorrow|this week)|works for me|monday|tuesday|wednesday|thursday|friday \d{1,2}(:\d{2})?\s?(am|pm)?)/i.test(text)) {
    return { label: "meeting_intent", confidence: 0.9 };
  }

  if (/(sounds good|interested|tell me more|this is helpful|yes,|sure,|ok,|how much|pricing|cost|quote)/i.test(text)) {
    return { label: "positive", confidence: 0.8 };
  }

  if (/(thanks|thank you|got it|received|following up)/i.test(text) || s.startsWith("re:")) {
    return { label: "neutral", confidence: 0.6 };
  }

  return null;
}

function normalizeText(plain?: string | null, html?: string | null): string {
  if (plain && plain.length > 40) return plain;
  const h = (html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  return (h || plain || "").replace(/\s+/g, " ").trim().slice(-8000);
}

async function llmClassify(text: string): Promise<{ label: Label; confidence: number; parts?: unknown }> {
  if (!openaiKey) {
    return { label: "neutral", confidence: 0.5, parts: { error: "missing_openai_key" } };
  }

  const prompt = [
    "Classify this email reply with one label from:",
    "positive, neutral, oos, bounce, ooo, meeting_intent.",
    "Return strict JSON: {label, confidence} where confidence in [0,1].",
    "If the message is purely an SMTP bounce or DSN, label=bounce.",
    "Text:",
    text.slice(0, 6000),
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("LLM classify failed", details);
      return { label: "neutral", confidence: 0.55, parts: { error: "llm_error", details } };
    }

    const json = await response.json();
    const parsed = safeJSON(json.choices?.[0]?.message?.content);
    const label = (parsed.label || "neutral") as Label;
    const confidence = clamp(Number(parsed.confidence ?? 0.7), 0.5, 1);
    return { label, confidence, parts: { raw: parsed } };
  } catch (err) {
    console.error("LLM classify exception", err);
    return { label: "neutral", confidence: 0.55, parts: { error: "llm_exception", details: String(err) } };
  }
}

async function loadReputation(
  supa: ReturnType<typeof createClient>,
  accountId: string,
  domain: string,
  threadId: string
): Promise<{ label: Label; confidence: number } | null> {
  const { data: threadRow, error: threadError } = await supa
    .from("reply_reputation_cache")
    .select("*")
    .eq("account_id", accountId)
    .eq("scope", "thread")
    .eq("key_text", threadId)
    .maybeSingle();

  if (threadError) {
    console.error("Thread reputation lookup failed", threadError);
  }

  if (threadRow) {
    return {
      label: threadRow.recent_label as Label,
      confidence: Number(threadRow.confidence),
    };
  }

  if (!domain) return null;

  const { data: domainRow, error: domainError } = await supa
    .from("reply_reputation_cache")
    .select("*")
    .eq("account_id", accountId)
    .eq("scope", "domain")
    .eq("key_text", domain)
    .maybeSingle();

  if (domainError) {
    console.error("Domain reputation lookup failed", domainError);
  }

  if (!domainRow) return null;
  return {
    label: domainRow.recent_label as Label,
    confidence: Number(domainRow.confidence),
  };
}

async function updateReputation(
  supa: ReturnType<typeof createClient>,
  msg: any,
  label: Label,
  confidence: number
) {
  const domain = (msg.from_email || "").split("@")[1]?.toLowerCase() || "";

  const upsertThread = supa.from("reply_reputation_cache").upsert(
    {
      account_id: msg.account_id,
      scope: "thread",
      key_text: msg.thread_id,
      recent_label: label,
      confidence,
      hits: 1,
    },
    { onConflict: "account_id,scope,key_text" }
  );

  const promises: Promise<unknown>[] = [upsertThread];

  if (domain) {
    promises.push(
      supa.from("reply_reputation_cache").upsert(
        {
          account_id: msg.account_id,
          scope: "domain",
          key_text: domain,
          recent_label: label,
          confidence: Math.max(confidence, 0.75),
          hits: 1,
        },
        { onConflict: "account_id,scope,key_text" }
      )
    );
  }

  await Promise.allSettled(promises);
}

async function persistResult(
  supa: ReturnType<typeof createClient>,
  msg: any,
  label: Label,
  confidence: number,
  via: "rules" | "reputation" | "llm",
  parts: unknown
) {
  const { error } = await supa.from("message_classifications").upsert(
    {
      account_id: msg.account_id,
      message_id: msg.id,
      label,
      confidence,
      via,
      parts,
    },
    { onConflict: "message_id" }
  );

  if (error) {
    console.error("Persist classification failed", { message_id: msg.id, error });
  }
}

async function triggerActions(supa: ReturnType<typeof createClient>, msg: any, label: Label) {
  const actions: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();

  const leadUpdate = (fields: Record<string, unknown>) =>
    supa.from("leads").update({ ...fields, updated_at: nowIso }).eq("id", msg.lead_id);

  switch (label) {
    case "ooo":
      actions.pause_ooo = true;
      await supa.from("threads").update({ paused_until: null }).eq("id", msg.thread_id);
      await leadUpdate({ next_nudge_preset: "ooo_reentry" });
      break;
    case "oos":
      actions.set_preset = "oos_route";
      await leadUpdate({ next_nudge_preset: "oos_route" });
      break;
    case "bounce":
      actions.set_preset = "verify_alt";
      await leadUpdate({ next_nudge_preset: "verify_alt" });
      if (BOUNCE_INTEL_URL) {
        fetch(BOUNCE_INTEL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: msg.id }),
        }).catch((err) => console.error("bounce intel hook failed", err));
      }
      break;
    case "meeting_intent":
      actions.meeting_draft = { minutes: 30, preset: "meeting_confirm" };
      await leadUpdate({ next_nudge_preset: "meeting_confirm" });
      break;
    case "positive":
      actions.set_preset = "meeting_confirm";
      await leadUpdate({ next_nudge_preset: "meeting_confirm" });
      break;
    case "neutral":
      actions.set_preset = "gentle_followup";
      await leadUpdate({ next_nudge_preset: "gentle_followup" });
      break;
  }

  const { error } = await supa.from("classifier_actions").insert({
    account_id: msg.account_id,
    message_id: msg.id,
    label,
    actions,
  });

  if (error) {
    console.error("Insert classifier_actions failed", { message_id: msg.id, error });
  }

  // Trigger conversation intelligence for non-bounce/non-ooo replies
  if (!["ooo", "bounce"].includes(label) && msg.thread_id) {
    // Call conversation-intelligence function
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (supabaseUrl) {
      const intelUrl = `${supabaseUrl}/functions/v1/conversation-intelligence`;
      fetch(intelUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ thread_id: msg.thread_id, message_id: msg.id }),
      }).catch((err) => console.error("conversation intelligence hook failed", err));
    }

    // Also call legacy THREAD_INTEL_URL if configured
    if (THREAD_INTEL_URL) {
      fetch(THREAD_INTEL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: msg.thread_id }),
      }).catch((err) => console.error("thread intel hook failed", err));
    }
  }

  if (label !== "bounce" && SIGNATURE_PARSE_URL) {
    fetch(SIGNATURE_PARSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: msg.id }),
    }).catch((err) => console.error("signature parse hook failed", err));
  }
}

function safeJSON(input: unknown) {
  try {
    if (typeof input === "string") return JSON.parse(input);
    return typeof input === "object" && input !== null ? input : {};
  } catch {
    return {};
  }
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

