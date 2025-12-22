// deno deploy on Supabase Edge
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

type Json = Record<string, unknown>;

async function sb(path: string, init: RequestInit = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`[Supabase] ${res.status} ${await res.text()}`);
  return res;
}

function simpleHeuristics(text: string) {
  const t = text.toLowerCase();
  const positive =
    /\b(yes|let's talk|interested|schedule|call|demo|sounds good|let's do|available|when works)\b/.test(t);
  const anti =
    /\b(out of office|auto.?reply|vacation|undeliverable|mailer-daemon|delivery status notification)\b/.test(t);
  const unsubscribe = /\b(unsubscribe|remove me|opt out)\b/.test(t);
  return { positive, anti, unsubscribe };
}

async function llmClassify(subject: string, body: string) {
  // Guard: if no key, skip gracefully
  if (!OPENAI_API_KEY) {
    return { is_reply: false, confidence: 0, reason: "No OPENAI_API_KEY configured" };
  }

  const prompt = `You are classifying if this message is a genuine human reply to a cold email.
Return strict JSON: {"is_reply":true|false,"confidence":0-1,"labels":["lead","oof","bounce","unsubscribe","other"]}

Subject: ${subject}

Body:
${body.slice(0, 8000)}
`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`[OpenAI] ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return { is_reply: false, confidence: 0.2, reason: "Parse error", raw };
  }
}

async function fetchOneJob() {
  const res = await sb("reply_jobs?status=eq.pending&select=*&limit=1&order=created_at.asc");
  const jobs = await res.json();
  return jobs[0];
}

async function runOneJob() {
  const job = await fetchOneJob();
  if (!job) return { status: "noop" };

  // mark processing
  await sb(`reply_jobs?id=eq.${job.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "processing" }),
  });

  // load email
  const emailRes = await sb(`emails?id=eq.${job.email_id}&select=*`);
  const emails = await emailRes.json();
  const email = emails[0];

  // defensive: if not incoming, just finish
  if (!email?.is_incoming) {
    await sb(`reply_jobs?id=eq.${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    });
    return { status: "skipped_non_incoming" };
  }

  const subject = email.subject ?? "";
  const body = email.body ?? email.body_text ?? email.body_html ?? "";
  const h = simpleHeuristics(`${subject}\n\n${body}`);

  let is_reply = false;
  let state: "none" | "suspected" | "confirmed" = "none";
  let labels: string[] = [];
  let confidence = 0;

  try {
    const llm = await llmClassify(subject, body);
    is_reply = !!llm.is_reply || h.positive;
    confidence = Math.max(Number(llm.confidence || 0), h.positive ? 0.6 : 0);
    labels = Array.isArray(llm.labels) ? llm.labels : [];

    if (h.unsubscribe) labels = Array.from(new Set([...labels, "unsubscribe"]));
    if (h.anti) labels = Array.from(new Set([...labels, "oof"]));

    state = is_reply ? (confidence >= 0.7 ? "confirmed" : "suspected") : "none";

    // write back to email
    await sb(`emails?id=eq.${email.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        is_reply,
        classification: { heuristics: h, llm },
      }),
    });

    // Update lead/campaign if this connects to a lead
    if (email.lead_id) {
      const payload: Json = { email_id: email.id, labels, confidence };

      // First, try to update campaign_leads if the lead is part of a campaign
      if (email.campaign_id) {
        // Get campaign_lead_id
        const clRes = await sb(
          `campaign_leads?campaign_id=eq.${email.campaign_id}&lead_id=eq.${email.lead_id}&select=id&limit=1`
        );
        const campaignLeads = await clRes.json();
        if (campaignLeads.length > 0) {
          await sb(`campaign_leads?id=eq.${campaignLeads[0].id}`, {
            method: "PATCH",
            body: JSON.stringify({
              last_incoming_at: new Date().toISOString(),
              reply_state: state,
              replied_at: state !== "none" ? new Date().toISOString() : null,
              has_replied: state !== "none", // Simple boolean flag
            }),
          });
        }
      }

      // Also update leads table if it has reply_state column
      await sb(`leads?id=eq.${email.lead_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          last_incoming_at: new Date().toISOString(),
          reply_state: state,
          replied_at: state !== "none" ? new Date().toISOString() : null,
        }),
      }).catch(() => {
        // Ignore if column doesn't exist
      });

      // log event
      const event = state === "confirmed"
        ? "reply_confirmed"
        : state === "suspected"
        ? "reply_suspected"
        : "incoming";
      await sb(`campaign_logs`, {
        method: "POST",
        body: JSON.stringify({
          campaign_id: email.campaign_id ?? null,
          lead_id: email.lead_id,
          email_id: email.id,
          event,
          payload,
        }),
      });
    }

    // finish job
    await sb(`reply_jobs?id=eq.${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    });

    return { status: "ok", job_id: job.id, state, labels, confidence };
  } catch (e) {
    await sb(`reply_jobs?id=eq.${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "error", error: String(e) }),
    });
    return { status: "error", error: String(e) };
  }
}

serve(async (req) => {
  // POST with body: webhook mode (from Gmail webhook)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      
      // Check if this is a direct webhook call with email, subject, textBody
      if (body.email && body.subject && body.textBody) {
        // Simple heuristic: not unsubscribe and >30 chars
        const replyDetected =
          body.textBody &&
          !body.textBody.toLowerCase().includes("unsubscribe") &&
          body.textBody.length > 30;

        if (replyDetected) {
          // Find lead by email (URL encode the email)
          const encodedEmail = encodeURIComponent(body.email);
          const leadRes = await sb(`leads?email=eq.${encodedEmail}&select=id&limit=1`);
          const leads = await leadRes.json();
          
          if (leads.length > 0) {
            // Find campaign_leads by lead_id
            const clRes = await sb(
              `campaign_leads?lead_id=eq.${leads[0].id}&select=id&limit=1`
            );
            const campaignLeads = await clRes.json();
            
            if (campaignLeads.length > 0) {
              await sb(`campaign_leads?id=eq.${campaignLeads[0].id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  has_replied: true,
                  replied_at: new Date().toISOString(),
                }),
              });
              console.log(`✅ Reply detected from ${body.email}`);
            }
          }
        }
        return new Response("OK", { status: 200 });
      }
      
      // Otherwise, run one job from queue (scheduler mode)
      const result = await runOneJob();
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" }});
    } catch (e) {
      console.error("Error in webhook:", e);
      return new Response("Error: " + String(e), { status: 500 });
    }
  }
  // GET health
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }});
});
