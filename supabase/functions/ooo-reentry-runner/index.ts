import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supa = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date().toISOString();
    const { data: due, error } = await supa
      .from("ooo_reentry_jobs")
      .select("id, account_id, thread_id, lead_id, resume_at, preset, status")
      .lte("resume_at", now)
      .eq("status", "scheduled")
      .limit(200);
    if (error) {
      throw error;
    }

    let processed = 0;
    const failures: Array<{ job_id: string; error: string }> = [];

    for (const job of due ?? []) {
      const updatedAt = new Date().toISOString();

      const { error: markRunningError } = await supa
        .from("ooo_reentry_jobs")
        .update({ status: "running", updated_at: updatedAt })
        .eq("id", job.id)
        .eq("status", "scheduled");
      if (markRunningError) {
        failures.push({ job_id: job.id, error: markRunningError.message });
        continue;
      }

      const { error: unpauseError } = await supa
        .from("threads")
        .update({ paused_until: null })
        .eq("id", job.thread_id);
      if (unpauseError) {
        failures.push({ job_id: job.id, error: unpauseError.message });
        await supa
          .from("ooo_reentry_jobs")
          .update({ status: "failed", error: unpauseError.message, updated_at: new Date().toISOString() })
          .eq("id", job.id);
        continue;
      }

      const { error: leadError } = await supa
        .from("leads")
        .update({ next_nudge_preset: job.preset, updated_at: updatedAt })
        .eq("id", job.lead_id);
      if (leadError) {
        failures.push({ job_id: job.id, error: leadError.message });
        await supa
          .from("ooo_reentry_jobs")
          .update({ status: "failed", error: leadError.message, updated_at: new Date().toISOString() })
          .eq("id", job.id);
        continue;
      }

      await supa
        .from("ooo_reentry_jobs")
        .update({ status: "done", updated_at: new Date().toISOString(), error: null })
        .eq("id", job.id);
      processed += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, processed, failures }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
