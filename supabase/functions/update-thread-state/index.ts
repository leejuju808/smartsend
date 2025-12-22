// Block 203 — Thread State System v1
// Edge function to update thread state based on message direction

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { thread_id, direction } = await req.json();

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!direction) {
      return new Response(
        JSON.stringify({ error: "direction is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let newState = "open";

    // Map direction values: 'incoming'/'inbound' → 'needs_reply', 'outgoing'/'outbound' → 'replied'
    if (direction === "incoming" || direction === "inbound") {
      newState = "needs_reply";
    } else if (direction === "outgoing" || direction === "outbound") {
      newState = "replied";
    }

    // Update thread state (but don't override 'closed' state unless explicitly set)
    const { data: currentThread } = await supabase
      .from("reply_threads")
      .select("state")
      .eq("id", thread_id)
      .single();

    // Only update if thread is not already closed
    if (currentThread?.state !== "closed") {
      const { error } = await supabase
        .from("reply_threads")
        .update({ state: newState })
        .eq("id", thread_id);

      if (error) {
        console.error("Error updating thread state:", error);
        return new Response(
          JSON.stringify({ error: "Failed to update thread state", details: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ state: currentThread?.state || newState }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in update-thread-state:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});










