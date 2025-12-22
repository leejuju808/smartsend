import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl, supabaseKey);
  try {
    const { thread_id } = await req.json();

    // Load context
    const { data: threadRows } = await supa
      .from("messages")
      .select(
        "id, account_id, lead_id, direction, subject, body_text, body_html, received_at, label:message_classifications(label)"
      )
      .eq("thread_id", thread_id)
      .order("received_at", { ascending: true });

    if (!threadRows?.length) return json({ ok: false, error: "no-messages" }, 404);
    const account_id = threadRows[0].account_id;
    const lead_id = threadRows[0].lead_id ?? null;
    const lastMsg = threadRows[threadRows.length - 1];

    const plain = threadRows.map((m) => renderMsg(m)).join("\n\n----\n\n").slice(-12000);

    // LLM: summary + stance + objections + sentiment + NBA
    const prompt = [
      "You are SmartSend's thread analyst. Produce concise JSON.",
      "Fields:",
      "- summary: 2–6 bullet lines, declarative, no fluff.",
      "- stance: one of [positive, neutral, oos, ooo, bounce, meeting_intent].",
      "- sentiment: integer -2..+2.",
      "- objections: array of keys from [price, timing, feature, authority, competitor, irrelevant, legal, security] with confidence 0..1.",
      "- nba: { key, payload }, where key ∈ [book_meeting, send_case_study, route_alt, pause_ooo, verify_email, handoff_ae, stop_sequence, clarify_need].",
      "Consider message labels already detected (shown inline).",
      "TEXT:",
      plain,
    ].join("\n\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    const j = await r.json();
    const out = safeParse(j.choices?.[0]?.message?.content);

    // Persist insights
    const { data: existing } = await supa
      .from("thread_insights")
      .select("id")
      .eq("account_id", account_id)
      .eq("thread_id", thread_id)
      .maybeSingle();
    const up = {
      account_id,
      thread_id,
      lead_id,
      last_message_id: lastMsg.id,
      summary: out.summary?.slice(0, 4000) ?? null,
      stance: out.stance ?? null,
      sentiment: clampInt(out.sentiment, -2, 2),
      confidence: clampNum(out.confidence ?? 0.7, 0, 1),
      nba_key: out.nba?.key ?? suggestNBAHeuristic(lastMsg),
      nba_payload: out.nba?.payload ?? heuristicPayload(lastMsg),
      extra: { llm: true },
    };
    if (existing?.id) {
      await supa
        .from("thread_insights")
        .update({ ...up, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supa.from("thread_insights").insert(up);
    }

    // Upsert objections
    const obs = Array.isArray(out.objections)
      ? (out.objections as Array<{ key: string; confidence?: number }>)
      : [];
    for (const o of obs) {
      if (!o?.key) continue;
      await supa.from("thread_objections").upsert(
        {
          account_id,
          thread_id,
          tag_key: o.key,
          confidence: clampNum(o.confidence ?? 0.7, 0, 1),
        },
        { onConflict: "account_id,thread_id,tag_key" },
      );
    }

    return json({ ok: true, insights: up, objections: obs });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function renderMsg(m: any) {
  const lab = m.label?.[0]?.label ? ` [label=${m.label[0].label}]` : "";
  const body = (m.body_text || m.body_html || "")
    .toString()
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dir = m.direction === "inbound" ? "FROM LEAD" : "FROM YOU";
  return `${dir}${lab} @ ${m.received_at}\nSUBJ: ${m.subject || ""}\n${body}`.slice(0, 2000);
}

function clampInt(n: any, lo: number, hi: number) {
  const x = parseInt(n ?? 0, 10);
  return Math.max(lo, Math.min(hi, x));
}

function clampNum(n: any, lo: number, hi: number) {
  const x = Number(n ?? 0);
  return Math.max(lo, Math.min(hi, x));
}

function safeParse(s: any) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

function suggestNBAHeuristic(last: any) {
  const lab = last?.label?.[0]?.label;
  if (lab === "meeting_intent") return "book_meeting";
  if (lab === "ooo") return "pause_ooo";
  if (lab === "bounce") return "verify_email";
  if (lab === "oos") return "route_alt";
  if (lab === "positive") return "book_meeting";
  return "clarify_need";
}

function heuristicPayload(last: any) {
  const lab = last?.label?.[0]?.label;
  switch (lab) {
    case "meeting_intent":
      return { minutes: 30, preset: "meeting_confirm" };
    case "ooo":
      return { until: null, preset: "ooo_reentry" };
    case "bounce":
      return { preset: "verify_alt" };
    case "oos":
      return { preset: "oos_route" };
    case "positive":
      return { preset: "meeting_confirm" };
    default:
      return { preset: "default" };
  }
}

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

