import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Controls = {
  tone?: "friendly" | "professional" | "casual";
  length?: "short" | "medium" | "long";
  cta_style?: "soft" | "direct";
  max_links?: number;
  add_unsubscribe?: boolean;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); // { queueId, controls? }
    const { queueId, controls } = body || {};
    if (!queueId) {
      return NextResponse.json({ error: "queueId required" }, { status: 400 });
    }

    // Fetch the held row
    const { data: q, error: qErr } = await supabase
      .from("send_queue")
      .select("id, account_id, subject, body_html")
      .eq("id", queueId)
      .single();

    if (qErr || !q) {
      return NextResponse.json(
        { error: qErr?.message || "Queue item not found" },
        { status: 400 }
      );
    }

    // Get preflight before
    const { data: before, error: beforeErr } = await supabase.rpc(
      "preflight_evaluate_row",
      { p_queue_id: queueId }
    );

    if (beforeErr) {
      return NextResponse.json(
        { error: `Preflight evaluation failed: ${beforeErr.message}` },
        { status: 500 }
      );
    }

    const beforeResult = Array.isArray(before) ? before[0] : before;

    // Default controls
    const defaultControls: Controls = {
      tone: "professional",
      length: "short",
      cta_style: "soft",
      max_links: 2,
      add_unsubscribe: true,
    };

    const finalControls = { ...defaultControls, ...controls };

    // Call OpenAI to generate rewrite
    const userPrompt = buildUserPrompt(
      q.subject ?? "",
      q.body_html ?? "",
      finalControls
    );
    const sysPrompt = SYS_PROMPT.replace(
      "{{MAX_LINKS}}",
      String(finalControls.max_links ?? 2)
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const txt = completion.choices[0]?.message?.content ?? "{}";
    const out = JSON.parse(txt);
    const newSubject = (out.subject ?? "").toString().slice(0, 120);
    const newHtml = (out.html ?? "").toString();

    // Create rewrite record
    const { data: rewrite, error: insErr } = await supabase
      .from("preflight_rewrites")
      .insert({
        account_id: q.account_id,
        queue_id: q.id,
        controls: finalControls,
        original_subject: q.subject,
        original_html: q.body_html,
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
      return NextResponse.json(
        { error: `Failed to create rewrite: ${insErr.message}` },
        { status: 500 }
      );
    }

    // Try to auto-apply if it passes
    const { data: applied, error: applyErr } = await supabase.rpc(
      "apply_rewrite_if_allowed",
      { p_rewrite_id: rewrite.id }
    );

    if (applyErr) {
      return NextResponse.json(
        { error: `Failed to apply rewrite: ${applyErr.message}` },
        { status: 500 }
      );
    }

    // Fetch the after result
    const { data: after, error: afterErr } = await supabase
      .from("preflight_rewrites")
      .select("preflight_after, decision_after, score_after, auto_applied")
      .eq("id", rewrite.id)
      .single();

    return NextResponse.json({
      ok: true,
      rewriteId: rewrite.id,
      applied: applied === true,
      before: beforeResult,
      after: after?.preflight_after,
      decisionAfter: after?.decision_after,
      scoreAfter: after?.score_after,
      autoApplied: after?.auto_applied ?? false,
    });
  } catch (error: any) {
    console.error("rewrite error", error);
    return NextResponse.json(
      { error: error.message || "Failed to create rewrite" },
      { status: 500 }
    );
  }
}














