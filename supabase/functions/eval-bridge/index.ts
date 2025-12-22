import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { sample_id, model_version, predicted_label, confidence } =
    await req.json();

  const { data: truth, error: truthError } = await supabase
    .from("ai_training_samples")
    .select("label")
    .eq("id", sample_id)
    .single();

  if (truthError) {
    return new Response(JSON.stringify({ error: truthError }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("ai_eval_results").insert({
    sample_id,
    model_version,
    predicted_label,
    true_label: truth?.label,
    confidence,
    eval_set: "reply_classifier",
    feedback_source: "auto_label",
  });

  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
















