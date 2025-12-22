// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// ==== CONFIG ====
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini"; // small/fast by default

type Payload = {
  subject?: string;
  html?: string;                   // body_html (may contain {{TOKENS}})
  goals?: string[];                // e.g., ["shorter", "friendlier", "avoid spam words"]
  tone?: "neutral"|"friendly"|"professional"|"casual"|"concise"|"persuasive";
  length?: "short"|"medium"|"long";
  reading_level?: "grade6"|"grade8"|"grade10"|"business";
  keep_unsub?: boolean;            // default true: keep lines containing {{UNSUB_LINK}}
  variant_count?: number;          // 1..3
};

function maskTokens(text: string): { masked: string; map: Record<string,string> } {
  const map: Record<string,string> = {};
  let idx = 0;
  const masked = text.replace(/\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}/g, (_m, key) => {
    const token = `__VAR_${idx}__`;
    map[token] = `{{${key}}}`;
    idx++;
    return token;
  });
  return { masked, map };
}

function unmaskTokens(text: string, map: Record<string,string>): string {
  let out = text;
  for (const k of Object.keys(map)) out = out.replaceAll(k, map[k]);
  return out;
}

function stripDangerous(text: string): string {
  // No tracking pixels or remote weirdness from LLMs
  return text.replace(/<img[^>]+>|<script[\s\S]*?<\/script>/gi, "");
}

function buildSystem(goals: string[], tone?: string, length?: string, reading?: string) {
  const lines = [
    "You rewrite cold email content for SMB outreach.",
    "HARD RULES:",
    "1) NEVER alter or invent any placeholders that look like __VAR_#__ ; keep them exactly as-is.",
    "2) Keep URLs, emails, and legal lines intact.",
    "3) Keep one concise CTA.",
    "4) No spammy phrases, no ALL CAPS, no deceptive claims.",
    "5) Keep reading level constraint if provided.",
    "6) If subject is provided, return a refined subject too.",
  ];
  const opts: string[] = [];
  if (tone) opts.push(`Tone: ${tone}`);
  if (length) opts.push(`Length: ${length}`);
  if (reading) opts.push(`Reading level: ${reading}`);
  if (goals?.length) opts.push(`Goals: ${goals.join("; ")}`);
  if (opts.length) lines.push(`PREFERENCES: ${opts.join(" | ")}`);
  lines.push("Return JSON with keys: { subject?: string, html?: string } only.");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const body = await req.json() as Payload;
    const {
      subject = "",
      html = "",
      goals = [],
      tone,
      length,
      reading_level,
      keep_unsub = true,
      variant_count = 1
    } = body;

    if (!subject && !html) {
      return new Response(JSON.stringify({ error: "Provide subject and/or html" }), { status: 400, headers: { "content-type":"application/json" }});
    }

    // Mask tokens so the model cannot mutate {{TOKENS}}
    const subMask = maskTokens(subject);
    const htmlMask = maskTokens(html);

    // Protect UNSUB block if requested (freeze that line/anchor)
    let frozenHtml = htmlMask.masked;
    let unsubGuard = "";
    if (keep_unsub) {
      // Extract unsub line (containing {{UNSUB_LINK}} → masked now) and re-append later if lost
      const unsubRegex = /.*__VAR_\d+__.*/im; // any line that contains a masked token (likely unsub)
      const m = frozenHtml.match(unsubRegex);
      if (m) unsubGuard = m[0];
    }

    const sys = buildSystem(goals, tone, length, reading_level);
    const userContent = JSON.stringify({
      subject: subMask.masked || undefined,
      html: frozenHtml || undefined
    });

    const messages = [
      { role: "system", content: sys },
      { role: "user", content: `Rewrite this email JSON while preserving placeholders exactly:\n${userContent}` }
    ];

    const n = Math.min(Math.max(variant_count, 1), 3);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "authorization": `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        n,
        response_format: { type: "json_object" }
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ ok:false, error: err }), { status: 500, headers: { "content-type":"application/json" }});
    }

    const data = await resp.json();
    const choices = Array.isArray(data.choices) ? data.choices : [data.choices];

    const variants = choices.map((ch: any) => {
      let parsed: any = {};
      try { parsed = JSON.parse(ch.message?.content || "{}"); } catch { parsed = {}; }
      let s = subMask.masked ? (parsed.subject ?? subMask.masked) : undefined;
      let h = htmlMask.masked ? (parsed.html ?? htmlMask.masked) : undefined;

      // Unmask placeholders
      if (s) s = unmaskTokens(s, subMask.map);
      if (h) {
        h = unmaskTokens(h, htmlMask.map);
        // Restore unsub guard if model dropped it
        if (keep_unsub && unsubGuard && !h.includes(unsubGuard)) {
          h = h + `\n\n${unsubGuard}`;
        }
        h = stripDangerous(h);
      }

      return { subject: s, html: h };
    });

    return new Response(JSON.stringify({ ok: true, model: MODEL, variants }), { headers: { "content-type":"application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" }});
  }
});


