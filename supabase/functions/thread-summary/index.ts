import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { summarizeThread } from "../_shared/threadSummary.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { thread_id } = await req.json();

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Generate summary
    const summary = await summarizeThread(thread_id);

    // Update thread with summary
    const { error: updateError } = await supabase
      .from("smartsend_threads")
      .update({ ai_summary: summary })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Failed to update thread summary:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update thread summary", details: updateError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, summary }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Thread summary error:", errorMsg);
    return new Response(
      JSON.stringify({ error: "Thread summary failed", details: errorMsg }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});








