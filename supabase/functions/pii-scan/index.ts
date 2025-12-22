import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Pattern = { pattern: string; replacement: string };

function applyPatterns(text: string | null, patterns: Pattern[]) {
  let out = text ?? "";
  for (const p of patterns) {
    try {
      const re = new RegExp(p.pattern, "gi");
      out = out.replace(re, p.replacement);
    } catch {
      // ignore bad pattern
    }
  }
  return out;
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { mode = "dry", sample_ids = [], limit = 200 } = await req.json();

  const { data: patterns, error: patternsError } = await supabase
    .from("ai_pii_patterns")
    .select("pattern,replacement")
    .eq("enabled", true);

  if (patternsError) {
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to fetch patterns" }),
      { status: 500 },
    );
  }

  const { data: samples, error: samplesError } = await supabase
    .from("ai_training_samples")
    .select("id,text")
    .order("created_at", { ascending: false })
    .limit(sample_ids.length ? sample_ids.length : Math.min(limit, 500));

  if (samplesError) {
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to fetch samples" }),
      { status: 500 },
    );
  }

  const picked = sample_ids.length
    ? (samples ?? []).filter((s) => sample_ids.includes(s.id))
    : (samples ?? []);

  const results: Array<{
    id: string;
    changed: boolean;
    preview_before: string;
    preview_after: string;
  }> = [];

  for (const s of picked) {
    const before = s.text ?? "";
    const after = applyPatterns(before, patterns ?? []);
    const changed = before !== after;

    results.push({
      id: s.id,
      changed,
      preview_before: before.slice(0, 160),
      preview_after: after.slice(0, 160),
    });

    if (changed && mode === "fix") {
      await supabase.from("ai_training_samples").update({ text: after }).eq(
        "id",
        s.id,
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, mode, scanned: results.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
















