import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { job_id, version_tag } = await req.json();

  // TODO: call provider to fetch status; mock success
  const providerStatus = "succeeded";

  if (providerStatus === "succeeded") {
    const { data: mv, error: mvErr } = await supabase.from("ai_model_versions").insert({
      name: "replies-cls",
      provider: "openai",
      model: "ft:gpt-4o-mini",
      version_tag: version_tag ?? `v${new Date().toISOString().slice(2, 10).replace(/-/g, ".")}`,
      notes: `Auto-registered from training job ${job_id}`,
      is_current: false,
    }).select("*").single();
    if (mvErr) return json({ ok: false, error: mvErr.message }, 500);

    await supabase.from("ai_training_jobs").update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      model_version_id: mv.id,
    }).eq("id", job_id);

    return json({ ok: true, model_version_id: mv.id, version_tag: mv.version_tag });
  }

  if (providerStatus === "failed") {
    await supabase.from("ai_training_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
    }).eq("id", job_id);
    return json({ ok: false, error: "training failed" }, 200);
  }

  await supabase.from("ai_training_jobs").update({ status: "running" }).eq("id", job_id);
  return json({ ok: true, status: "running" });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}



















