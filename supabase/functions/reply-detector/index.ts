// supabase/functions/reply-detector/index.ts
// Deno Deploy target

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = {
  id: string;
  campaign_id: string;
  thread_id: string | null;
  subject: string | null;
  snippet: string | null;
  raw_headers: Record<string, string> | null;
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY")!;

const KIND = ["human", "ooo", "auto", "bounce", "unsubscribe", "spam", "unknown"] as const;
type Kind = typeof KIND[number];

async function classify(text: string): Promise<{ kind: Kind; confidence: number }> {
  const prompt = `
You classify inbound email into one of:

- human: a human wrote a reply (any sentiment), exclude OOO/robots

- ooo: out-of-office or vacation auto-responder

- auto: generic auto-responder/notification (not delivery failure)

- bounce: delivery failure / daemon

- unsubscribe: explicit opt-out ("unsubscribe", "remove me", etc.)

- spam: obvious spam

- unknown: can't tell



Return JSON: {"kind": "...", "confidence": 0.0..1.0}

Text:

${text.slice(0, 5000)}
`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });

  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    let kind: Kind = KIND.includes(parsed.kind) ? parsed.kind : "unknown";
    let confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    return { kind, confidence };
  } catch {
    return { kind: "unknown", confidence: 0.0 };
  }
}

Deno.serve(async (req) => {
  // optional: require a cron secret
  const auth = req.headers.get("authorization");
  if (Deno.env.get("CRON_SECRET") && auth !== `Bearer ${Deno.env.get("CRON_SECRET")}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    {
      auth: { persistSession: false },
    }
  );

  // 1) pull a small batch
  const { data: rows, error } = await supabase
    .from("email_events")
    .select("id,campaign_id,thread_id,subject,snippet,raw_headers")
    .eq("direction", "inbound")
    .is("ai_reply_kind", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return new Response(error.message, { status: 500 });
  if (!rows || rows.length === 0) return new Response("ok");

  for (const ev of rows as Row[]) {
    const text = `${ev.subject ?? ""}\n\n${ev.snippet ?? ""}`;
    const { kind, confidence } = await classify(text);

    // 2) upsert classification
    await supabase
      .from("email_events")
      .update({
        ai_reply_kind: kind,
        ai_confidence: confidence,
        classified_at: new Date().toISOString(),
      })
      .eq("id", ev.id);

    // 3) optional automark
    if (kind === "human" && ev.thread_id) {
      const { data: c } = await supabase
        .from("campaigns")
        .select("auto_reply_detection")
        .eq("id", ev.campaign_id)
        .single();
      if (c?.auto_reply_detection) {
        await supabase
          .from("lead_threads")
          .update({ status: "replied", ai_last_reply_kind: kind })
          .eq("id", ev.thread_id)
          .in("status", ["open", "snoozed"]); // don't move archived
      } else if (ev.thread_id) {
        // Still update ai_last_reply_kind even if auto_reply_detection is off
        await supabase
          .from("lead_threads")
          .update({ ai_last_reply_kind: kind })
          .eq("id", ev.thread_id);
      }
    } else if (ev.thread_id) {
      await supabase
        .from("lead_threads")
        .update({ ai_last_reply_kind: kind })
        .eq("id", ev.thread_id);
    }
  }

  return new Response("ok");
});
