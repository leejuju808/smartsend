import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { job_id } = await req.json();
  if (!job_id) {
    return new Response(JSON.stringify({ error: "job_id is required" }), { status: 400 });
  }

  // 1) Load job
  const { data: jobs, error: jobFetchError } = await supabase
    .from("ai_training_jobs")
    .select("*")
    .eq("id", job_id)
    .limit(1);
  if (jobFetchError) {
    return new Response(JSON.stringify({ error: jobFetchError.message }), { status: 400 });
  }

  const job = jobs?.[0];
  if (!job) {
    return new Response(JSON.stringify({ error: "job not found" }), { status: 404 });
  }

  // 2) Flip to training
  const nowIso = new Date().toISOString();
  await supabase
    .from("ai_training_jobs")
    .update({ status: "training", started_at: nowIso })
    .eq("id", job_id);
  await supabase.from("ai_model_registry").update({ status: "training" }).eq("model_version", job.target_model_version);

  // 3) (Stub) Call your trainer (OpenAI fine-tune, custom endpoint, etc.)
  const trainMetrics = { note: "stub-train", accuracy: null };

  // 4) Complete
  await supabase
    .from("ai_training_jobs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      stats: { ...(job.stats || {}), trainMetrics },
    })
    .eq("id", job_id);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
















