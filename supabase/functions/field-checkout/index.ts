// Block 22750 — SmartSend Roofing Field App v1
// Edge Function — Field Check-Out Update Progress
// When a foreman checks out and sets progress %, we update:
// - job_field_sessions.progress_percent
// - roofing_jobs.progress_percent (for forecasting engine)
// - Insert a timeline entry

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { field_session_id, job_id, workspace_id, progress_percent, notes } = await req.json();

    if (!field_session_id || !job_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "field_session_id, job_id, workspace_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const nowIso = new Date().toISOString();
    const progress = Number(progress_percent ?? 0);

    // Validate progress is between 0-100
    if (progress < 0 || progress > 100) {
      return new Response(
        JSON.stringify({ error: "progress_percent must be between 0 and 100" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 1️⃣ Update field session
    const { error: sessionError } = await supabase
      .from("job_field_sessions")
      .update({
        check_out_at: nowIso,
        progress_percent: progress,
        notes
      })
      .eq("id", field_session_id)
      .eq("workspace_id", workspace_id);

    if (sessionError) {
      console.error("Error updating field session:", sessionError);
      throw sessionError;
    }

    // 2️⃣ Update job progress (simple overwrite in v1)
    const { error: jobError } = await supabase
      .from("roofing_jobs")
      .update({
        progress_percent: progress
      })
      .eq("id", job_id)
      .eq("workspace_id", workspace_id);

    if (jobError) {
      console.error("Error updating job progress:", jobError);
      throw jobError;
    }

    // 3️⃣ Insert a job timeline event (using job_timelines table)
    // First, get the lead_id from the job
    const { data: job, error: jobFetchError } = await supabase
      .from("roofing_jobs")
      .select("lead_id")
      .eq("id", job_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (!jobFetchError && job?.lead_id) {
      await supabase
        .from("job_timelines")
        .insert({
          lead_id: job.lead_id,
          event_type: "field_update",
          event_data: {
            job_id,
            field_session_id,
            progress_percent: progress,
            check_out_at: nowIso,
            notes: notes || null
          }
        });
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    console.error("Field checkout error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});







































