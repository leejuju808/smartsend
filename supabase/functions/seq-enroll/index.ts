import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const EDGE_URL = Deno.env.get("SUPABASE_EDGE_URL") || 
  Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") + "/functions/v1";

serve(async (req) => {
  try {
    const { org_id, lead_id, sequence_id } = await req.json();

    if (!org_id || !lead_id || !sequence_id) {
      return new Response(
        JSON.stringify({ error: "org_id, lead_id, and sequence_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find step 1
    const { data: step1, error: step1Error } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", sequence_id)
      .eq("step_number", 1)
      .maybeSingle();

    if (step1Error || !step1) {
      return new Response(
        JSON.stringify({ error: "No step 1 found" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Compute due (usually now snapped into window)
    const dueResp = await fetch(`${EDGE_URL}/seq-next-due`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id,
        base_from: new Date().toISOString(),
        wait_days: 0,
      }),
    });

    if (!dueResp.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to compute next due time" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const dueData = await dueResp.json();

    // Create enrollment
    const { data: enroll, error: enrollError } = await supabase
      .from("sequence_enrollments")
      .insert({
        org_id,
        lead_id,
        sequence_id,
        current_step: 0,
        status: "active",
        next_due_at: dueData.due_at,
      })
      .select("*")
      .single();

    if (enrollError || !enroll) {
      return new Response(
        JSON.stringify({ error: enrollError?.message || "Failed to create enrollment" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert queue row for step 1
    const { error: queueError } = await supabase.from("followup_queue").insert({
      org_id,
      enrollment_id: enroll.id,
      step_number: 1,
      due_at: dueData.due_at,
    });

    if (queueError) {
      // Rollback enrollment if queue insert fails
      await supabase.from("sequence_enrollments").delete().eq("id", enroll.id);
      return new Response(
        JSON.stringify({ error: "Failed to queue step 1" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, enrollment_id: enroll.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

