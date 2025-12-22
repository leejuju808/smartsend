// Supabase Edge (Deno)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE);

const LINK_PATTERNS = [
  /https?:\/\/(?:www\.)?calendly\.com\/[^\s)]+/ig,
  /https?:\/\/(?:www\.)?cal\.com\/[^\s)]+/ig,
  /https?:\/\/(?:www\.)?hubspot\.com\/meetings\/[^\s)]+/ig,
  /https?:\/\/(?:www\.)?oncehub\.com\/[^\s)]+/ig,
  /https?:\/\/(?:www\.)?motion\.app\/(?:book|meet)\/[^\s)]+/ig
];

function findLinks(text: string): string[] {
  const links = new Set<string>();
  for (const re of LINK_PATTERNS) {
    const m = text.match(re);
    if (m) m.forEach((u) => links.add(u));
  }
  return [...links];
}

async function llmTimes(subject: string, body: string) {
  const sys = `Extract possible meeting windows mentioned in the email body.
Return strict JSON: {"timezone": string|null, "times": string[] ISO8601 Z, "note": string}`;
  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `SUBJECT: ${subject}\nBODY:\n${body}` }
    ]
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${SERVICE}`) return new Response("forbidden", { status: 403 });

  const { email_id } = await req.json();

  const { data: e } = await sb.from("emails").select("id,account_id,subject,body_plain,body_text,body_html").eq("id", email_id).single();
  if (!e) return new Response(JSON.stringify({ error: "email_not_found" }), { status: 404 });

  // Extract text from body_plain, body_text, or body_html (in that order)
  const text = (e.body_plain || e.body_text || e.body_html || "").slice(0, 10000);
  const links = findLinks(text);

  // store link suggestions
  for (const link of links) {
    await sb.from("meeting_suggestions").insert({
      account_id: e.account_id, email_id: e.id, source: "link_detect", link, confidence: 0.9
    });
  }

  // LLM time parsing (best-effort)
  try {
    const out = await llmTimes(e.subject ?? "", text);
    if (out?.times?.length) {
      await sb.from("meeting_suggestions").insert({
        account_id: e.account_id,
        email_id: e.id,
        source: "llm",
        timezone: out.timezone ?? null,
        proposed_times: out.times,
        confidence: 0.7,
        note: out.note ?? null
      });
    }
  } catch (_err) {/* soft fail */}

  return new Response(JSON.stringify({ ok: true, links: links.length }), { headers: { "Content-Type": "application/json" } });
});

