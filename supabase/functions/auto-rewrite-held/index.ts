// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!; // set in Supabase env

type Controls = {
  tone?: "friendly" | "professional" | "casual";
  length?: "short" | "medium" | "long";
  cta_style?: "soft" | "direct";
  max_links?: number; // default 2
  add_unsubscribe?: boolean; // default true
};

const SYS_PROMPT = `
You are a cold email copy doctor for SmartSend. Rewrite emails to reduce spam signals and pass preflight checks:

- Keep it truthful. No exaggerated claims.
- Subject: natural case, <= 7 words, no ALL CAPS, no clickbait.
- Body: concise first touch (<= 120–140 words for "short"), plain HTML, clear single CTA.
- Links: at most {{MAX_LINKS}} total; remove shorteners (bit.ly, t.co, etc); prefer root domains.
- Include a plain-language opt-out line at the bottom ("If this isn't relevant, reply 'remove' and I'll stop.").
- Preserve merge tags like {{first_name}}, {{company}} exactly.
- No tracking pixels or invisible text.

Return valid HTML only, with <p> paragraphs and <a> tags as needed. Do not include code fences.
`;

function buildUserPrompt(subject: string, html: string, controls: Controls) {
  const maxLinks = controls.max_links ?? 2;
  const tone = controls.tone ?? "professional";
  const len = controls.length ?? "short";
  const cta = controls.cta_style ?? "soft";
  const unsub = controls.add_unsubscribe ?? true;
  return `
Original Subject:
${subject || "(none)"}

Original HTML:
${html || "(none)"}

Rewrite controls:
- tone: ${tone}
- length: ${len}
- cta_style: ${cta}
- max_links: ${maxLinks}
- add_unsubscribe: ${unsub ? "yes" : "no"}

Task:
1) Propose a new Subject.
2) Produce cleaned HTML with at most ${maxLinks} links, no shorteners, and include an opt-out line${unsub ? "" : " (SKIP)"}.
3) Keep merge tags like {{first_name}} intact.

Output JSON:
{ "subject": "...", "html": "..." }
`.trim();
}

async function callOpenAI(prompt: string, maxLinks: number) {
  const sysPrompt = SYS_PROMPT.replace("{{MAX_LINKS}}", maxLinks.toString());
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(txt);
}

export async function handler() {
  // 1) Pull a small batch of held_preflight rows
  const { data: held, error: heldErr } = await sb
    .from("send_queue")
    .select("id, account_id, subject, body_html")
    .eq("status", "held_preflight")
    .limit(20);

  if (heldErr) {
    console.error("Error fetching held emails:", heldErr);
    return new Response(JSON.stringify({ error: heldErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!held?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  let processed = 0;
  let errors = 0;

  for (const row of held) {
    try {
      // You can store per-account defaults later; for now simple defaults
      const controls: Controls = {
        tone: "professional",
        length: "short",
        cta_style: "soft",
        max_links: 2,
        add_unsubscribe: true,
      };

      // 2) Produce rewrite
      const userPrompt = buildUserPrompt(
        row.subject ?? "",
        row.body_html ?? "",
        controls
      );
      const out = await callOpenAI(userPrompt, controls.max_links ?? 2);
      const newSubject = (out.subject ?? "").toString().slice(0, 120);
      const newHtml = (out.html ?? "").toString();

      // 3) Save rewrite (before/after preflight)
      const { data: before, error: beforeErr } = await sb.rpc(
        "preflight_evaluate_row",
        { p_queue_id: row.id }
      );

      if (beforeErr) {
        console.error("Error evaluating preflight before:", beforeErr);
        errors++;
        continue;
      }

      const beforeResult = Array.isArray(before) ? before[0] : before;

      const { data: ins, error: insErr } = await sb
        .from("preflight_rewrites")
        .insert({
          account_id: row.account_id,
          queue_id: row.id,
          controls,
          original_subject: row.subject,
          original_html: row.body_html,
          rewritten_subject: newSubject,
          rewritten_html: newHtml,
          preflight_before: beforeResult
            ? {
                decision: beforeResult.decision,
                score: beforeResult.score,
                reasons: beforeResult.reasons,
                details: beforeResult.details,
              }
            : null,
        })
        .select("id")
        .single();

      if (insErr) {
        console.error("Error inserting rewrite:", insErr);
        errors++;
        continue;
      }

      // 4) Try to auto-apply if it now passes
      const { data: applied, error: applyErr } = await sb.rpc(
        "apply_rewrite_if_allowed",
        { p_rewrite_id: ins.id }
      );

      if (applyErr) {
        console.error("Error applying rewrite:", applyErr);
        errors++;
        continue;
      }

      // If not auto-applied, leave it for human review in Triage (Block 122)
      console.log("rewrite", row.id, "applied?", applied === true);
      processed++;
    } catch (e) {
      console.error("rewrite error", row.id, e);
      errors++;
      // leave row held; triage will handle manually
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, errors }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

Deno.serve(handler);














