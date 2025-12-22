import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Label = "positive" | "negative" | "neutral" | "question" | "unsubscribe" | "bounce" | "oof";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { size = 200, name, notes } = await req.json().catch(() => ({} as Record<string, unknown>));
    const labels: Label[] = ["positive", "negative", "neutral", "question", "unsubscribe", "bounce", "oof"];
    const totalDesired = Number.isFinite(size) ? Math.max(1, Math.floor(size as number)) : 200;
    const perLabel = Math.max(1, Math.floor(totalDesired / labels.length));

    const fallbackName = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}-${totalDesired}`;

    const { data: setRow, error: setErr } = await supabase
      .from("ai_eval_sets")
      .insert({
        name: (typeof name === "string" && name.trim().length > 0)
          ? name
          : fallbackName,
        sample_size: totalDesired,
        notes: typeof notes === "string" ? notes : null,
        source: "feedback",
      })
      .select("*")
      .single();
    if (setErr || !setRow) throw setErr ?? new Error("Failed to create eval set");

    let totalInserted = 0;

    for (const label of labels) {
      const { data, error } = await supabase.rpc("random_feedback_sample", { p_label: label, p_limit: perLabel });
      if (error) throw error;

      if (data && Array.isArray(data) && data.length > 0) {
        const rows = data.map((r: any) => ({
          eval_set_id: setRow.id,
          message_id: r.message_id,
          gold_label: r.label,
          text_excerpt: String(r.text_excerpt ?? "").slice(0, 2000),
          meta: {
            confidence: r.confidence,
            source: r.source,
            feedback_id: r.id,
          },
        }));

        const { error: insErr } = await supabase.from("ai_eval_samples").insert(rows);
        if (insErr) throw insErr;
        totalInserted += rows.length;
      }
    }

    if (totalInserted < totalDesired) {
      const remaining = totalDesired - totalInserted;
      const { data, error } = await supabase.rpc("random_feedback_sample_any", { p_limit: remaining });
      if (error) throw error;

      if (data && Array.isArray(data) && data.length > 0) {
        const rows = data.map((r: any) => ({
          eval_set_id: setRow.id,
          message_id: r.message_id,
          gold_label: r.label,
          text_excerpt: String(r.text_excerpt ?? "").slice(0, 2000),
          meta: {
            confidence: r.confidence,
            source: r.source,
            feedback_id: r.id,
          },
        }));

        const { error: insErr } = await supabase.from("ai_eval_samples").insert(rows);
        if (insErr) throw insErr;
        totalInserted += rows.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, eval_set_id: setRow.id, inserted: totalInserted }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

