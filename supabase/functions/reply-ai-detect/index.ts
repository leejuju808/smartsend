// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// light client (no external deps)
async function sb(path: string, init: RequestInit = {}) {
  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...(init.headers || {}),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

type ReplyRow = {
  id: string;
  thread_id: string | null;
  sender: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
};

async function classify(text: string) {
  const sys = `You are an assistant that classifies cold email replies.

Labels:
- positive (interested/booking/intro)
- neutral (generic response/need info)
- negative (not interested)
- ooh (out of office, autoresponder)
- unsubscribe (asks to stop emailing)
- not_a_reply (bounces, forwards, spam noise)

Return JSON: {"label":"<one of labels>","confidence":0..1}`;
  const user = `Email reply:\n${text}\n\nReturn JSON only.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      temperature: 0.1
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed: { label?: string; confidence?: number } = {};
  try { parsed = JSON.parse(content); } catch { /* fallback below */ }
  const label = (parsed.label || "unknown").toLowerCase();
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  return { label, confidence };
}

Deno.serve(async (_req: Request) => {
  try {
    // 1) claim up to N pending jobs
    const jobs = await sb("reply_ai_jobs?status=eq.pending&select=id,reply_id&limit=25&order=created_at.asc", { method: "GET" });

    // nothing to do
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } });
    }

    // 2) process each job
    for (const job of jobs) {
      try {
        // mark as processing
        await sb(`reply_ai_jobs?id=eq.${job.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "processing", updated_at: new Date().toISOString() }),
          headers: { Prefer: "resolution=merge-duplicates" },
        } as any);

        // get the reply row
        const replies: ReplyRow[] = await sb(`email_replies?id=eq.${job.reply_id}&select=id,thread_id,sender,subject,snippet,received_at&limit=1`, { method: "GET" });
        const reply = replies?.[0];

        if (!reply) {
          throw new Error("Reply not found");
        }

        const text = `${reply.subject || ""}\n${reply.snippet || ""}`.trim();
        const { label, confidence } = await classify(text);

        // update reply classification
        await sb(`email_replies?id=eq.${reply.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ai_label: label, ai_confidence: confidence }),
          headers: { Prefer: "resolution=merge-duplicates" },
        } as any);

        // mark thread as replied (except not_a_reply/unknown)
        const isRealReply = !["not_a_reply", "unknown"].includes(label);
        if (reply.thread_id && isRealReply) {
          // Update or create thread
          // Use upsert pattern: try to update, if not found then the reply should have created the thread
          // Note: thread_id in email_replies should reference email_threads.id
          await sb(`email_threads?id=eq.${reply.thread_id}`, {
            method: "PATCH",
            body: JSON.stringify({
              is_replied: true,
              last_reply_at: reply.received_at || new Date().toISOString(),
              last_reply_label: label,
              updated_at: new Date().toISOString()
            }),
            headers: { Prefer: "resolution=merge-duplicates" },
          } as any);
        }

        // complete job
        await sb(`reply_ai_jobs?id=eq.${job.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done", updated_at: new Date().toISOString() }),
          headers: { Prefer: "resolution=merge-duplicates" },
        });
      } catch (e) {
        await sb(`reply_ai_jobs?id=eq.${job.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "error", error: String(e), updated_at: new Date().toISOString() }),
          headers: { Prefer: "resolution=merge-duplicates" },
        });
      }
    }

    return new Response(JSON.stringify({ processed: jobs.length }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

