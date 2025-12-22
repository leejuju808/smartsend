// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";
import {
  extractTokens,
  tokensPreserved,
  spamScore
} from "../_shared/merge-utils.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

type Req = {
  campaign_id: string;
  step_no: number;
  base_subject: string;
  base_body_html: string;
  tone?: "friendly" | "formal" | "bold" | "casual" | "playful" | "concise";
  target_length?: "short" | "medium" | "long";
  reading_level?: "6th" | "8th" | "10th" | "professional";
  personalization?: "none" | "light" | "strong";
};

function sysPrompt() {
  return [
    "You are an expert cold-email copywriter.",
    "Rewrite subject and HTML body to match the controls.",
    "STRICT RULES:",
    "1) Preserve ALL merge tokens exactly (e.g., {{first_name}}, {{company.name}}). Do NOT invent new tokens.",
    "2) Keep links and HTML valid. Use simple tags: <p>, <strong>, <em>, <ul>/<li>, <a>.",
    "3) Aim for deliverability: avoid spammy phrases, minimize exclamation marks, no ALL CAPS subjects.",
    "4) Start body with a short, clear opening that references {{company}} or {{first_name}} if present.",
    "5) Keep one clear CTA.",
    "OUTPUT JSON ONLY: {subject: string, body_html: string}"
  ].join("\n");
}

function userPrompt(r: Req) {
  return `Controls:
- Tone: ${r.tone || "concise"}
- Length: ${r.target_length || "short"}
- Reading level: ${r.reading_level || "8th"}
- Personalization: ${r.personalization || "light"}

Base:
SUBJECT: ${r.base_subject}
HTML:
${r.base_body_html}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SRK);

  try {
    const r = (await req.json()) as Req;

    const { data: can } = await sb.rpc("has_feature", {
      p_campaign: r.campaign_id,
      p_feature: "smart_rewriter"
    });
    if (can !== true) {
      return new Response(
        JSON.stringify({ ok: false, error: "Plan does not include Smart Rewriter" }),
        { status: 403 }
      );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: sysPrompt() },
          { role: "user", content: userPrompt(r) }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: await res.text() }),
        { status: 400 }
      );
    }

    const j = await res.json();
    const parsed = (() => {
      try {
        return JSON.parse(j.choices[0].message.content);
      } catch {
        return null;
      }
    })();

    const result_subject: string = parsed?.subject || r.base_subject;
    const result_body_html: string = parsed?.body_html || r.base_body_html;

    const ok = tokensPreserved(
      r.base_subject,
      r.base_body_html,
      result_subject,
      result_body_html
    );
    const spam = spamScore(result_subject, result_body_html);

    const { data: session } = await sb.auth.getSession();
    const user_id = session?.session?.user?.id || null;

    const { data: draft, error: derr } = await sb
      .from("rewriter_drafts")
      .insert({
        user_id,
        campaign_id: r.campaign_id,
        step_no: r.step_no,
        base_subject: r.base_subject,
        base_body_html: r.base_body_html,
        tone: r.tone || "concise",
        target_length: r.target_length || "short",
        reading_level: r.reading_level || "8th",
        personalization: r.personalization || "light",
        result_subject,
        result_body_html,
        merge_ok: ok,
        spam_score: spam,
        notes: {
          tokens_required: [
            ...extractTokens(r.base_subject),
            ...extractTokens(r.base_body_html)
          ]
        }
      })
      .select("id")
      .single();

    if (derr) throw derr;

    return new Response(
      JSON.stringify({
        ok: true,
        draft_id: draft.id,
        result_subject,
        result_body_html,
        merge_ok: ok,
        spam_score: spam
      }),
      { status: 200 }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 400 }
    );
  }
});











