import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Missing Supabase environment configuration");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const BAD = ["guarantee", "free!!!", "risk-free", "limited time only", "act now"];

function scoreDraft(draft: string, label: string, reference: string, expected: Record<string, unknown>) {
  const words = draft.trim().split(/\s+/).filter(Boolean).length;
  const lengthMin = typeof expected?.length_min === "number" ? expected.length_min : 70;
  const lengthMax = typeof expected?.length_max === "number" ? expected.length_max : 110;
  const targetAvg = (lengthMin + lengthMax) / 2;
  const lenScore = Math.max(0, 1 - Math.abs(targetAvg - words) / 100);

  const ctaMatch = /(schedule|book|calendar|call|reply|meet|link)/i.test(draft) ? 1 : 0;
  const spamPenalty = BAD.some((b) => draft.toLowerCase().includes(b)) ? -0.3 : 0;

  const refTokens = new Set(reference.toLowerCase().split(/\W+/).filter(Boolean));
  const drTokens = new Set(draft.toLowerCase().split(/\W+/).filter(Boolean));
  const inter = [...drTokens].filter((t) => refTokens.has(t)).length;
  const union = new Set([...drTokens, ...refTokens]).size || 1;
  const jaccard = inter / union;

  let labelFit = 0.6;
  if (label === "objection" && /understand|acknowledge|totally get/i.test(draft)) {
    labelFit = 1.0;
  }
  if (label === "meeting_intent" && /confirm|lock in|calendar/i.test(draft)) {
    labelFit = 1.0;
  }

  return Math.max(0, Math.min(1, 0.35 * lenScore + 0.25 * ctaMatch + 0.2 * jaccard + 0.2 * labelFit + spamPenalty));
}

Deno.serve(async (req) => {
  try {
    const { owner_id, sample_size = 25 } = await req.json();

    if (!owner_id) {
      return new Response(JSON.stringify({ error: "Missing owner_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { data: evals, error: fetchError } = await supabase
      .from("nudge_offline_eval")
      .select("*")
      .eq("owner_id", owner_id)
      .limit(sample_size);

    if (fetchError) {
      console.error("offline eval fetch error", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const results: Array<{ label: string; tone?: string; score: number }> = [];

    for (const row of evals ?? []) {
      const response = await fetch(`${supabaseUrl}/functions/v1/nudge-generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner_id,
          campaign_id: null,
          label: row.label,
          thread_summary: row.thread_summary,
        }),
      });

      if (!response.ok) {
        console.error("nudge-generate failure", await response.text());
        continue;
      }

      const generated = await response.json();
      const tone = generated?.tone;
      const draft = generated?.draft ?? "";

      const score = scoreDraft(
        draft,
        row.label,
        row.reference ?? "",
        (row.expected_properties ?? {}) as Record<string, unknown>,
      );

      results.push({ label: row.label, tone, score });
    }

    const avg =
      results.reduce((acc, cur) => acc + cur.score, 0) / (results.length === 0 ? 1 : results.length);

    return new Response(JSON.stringify({ avg, results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("nudge-offline-eval error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});


