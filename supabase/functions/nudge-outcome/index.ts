import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env configuration");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    const { event_id, outcome } = await req.json();

    if (!event_id || !outcome) {
      return new Response(JSON.stringify({ ok: false, error: "Missing params" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("nudge_outcomes")
      .insert([{ event_id, outcome }]);

    if (error) {
      console.error("nudge_outcome insert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const success = ["reply", "meeting"].includes(outcome);

    const { data: usage, error: usageError } = await supabase
      .from("nudge_prompt_usage")
      .select("candidate_id")
      .eq("event_id", event_id)
      .maybeSingle();

    if (usageError) {
      console.error("nudge_prompt_usage fetch error", usageError);
    } else if (usage?.candidate_id) {
      const { error: bumpCandidateError } = await supabase.rpc("bump_candidate_stats", {
        candidate_id_in: usage.candidate_id,
        success_in: success,
      });

      if (bumpCandidateError) {
        console.error("bump_candidate_stats error", bumpCandidateError);
      }
    }

    const [{ error: bumpSnippetError }, { error: bumpTimingError }] = await Promise.all([
      supabase.rpc("bump_snippet_stats", {
        event: event_id,
        success,
      }),
      supabase.rpc("bump_timing_stats", {
        event: event_id,
        success,
      }),
    ]);

    if (bumpSnippetError) {
      console.error("bump_snippet_stats error", bumpSnippetError);
      return new Response(JSON.stringify({ ok: false, error: bumpSnippetError.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    if (bumpTimingError) {
      console.error("bump_timing_stats error", bumpTimingError);
      return new Response(JSON.stringify({ ok: false, error: bumpTimingError.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("nudge-outcome error", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});

