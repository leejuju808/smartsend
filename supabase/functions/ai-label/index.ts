// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

function simpleHeuristic(subject: string, body: string) {
  const s = (subject + " " + body).toLowerCase();

  if (/\bunsubscribe\b|remove me|opt out/i.test(s)) return { label: "unsubscribe", confidence: 0.95 };
  if (/\bbounced mail\b|undeliverable|delivery status notification/i.test(s)) return { label: "bounce", confidence: 0.95 };
  if (/\bout of office\b|auto[- ]reply|away until|vacation/i.test(s)) return { label: "ooh", confidence: 0.9 };
  if (/\bforwarded message\b|fwd:/i.test(s)) return { label: "routing", confidence: 0.7 };
  if (/\b\?|could you|can you|what time|how much|when can/i.test(s)) return { label: "question", confidence: 0.75 };
  if (/\bthanks|great|sounds good|let's do|interested|book|schedule|call|meeting|demo|yes\b/i.test(s))
    return { label: "positive", confidence: 0.7 };
  if (/\bno thanks|not interested/i.test(s)) return { label: "neutral", confidence: 0.6 };

  if (body.length > 80) return { label: "human_reply", confidence: 0.55 };
  return { label: "noise", confidence: 0.4 };
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const j = await req.json().catch(() => ({}));
  const subject = j?.subject ?? "";
  const body = j?.body ?? "";
  const res = simpleHeuristic(subject, body);
  return new Response(JSON.stringify({ ...res, model: "heuristic-v1" }), {
    headers: { "content-type": "application/json" },
  });
});


