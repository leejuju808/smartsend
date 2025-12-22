// Block 224 — Team Analytics v1
// Edge function to update user metrics

import { serve } from "https://deno.land/x/sift/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id, workspace_id, type } = payload;

    if (!user_id || !workspace_id || !type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fieldMap: Record<string, string> = {
      "email_sent": "emails_sent",
      "reply_received": "replies_received",
      "open": "opens",
      "click": "clicks",
      "meeting_booked": "meetings_booked",
    };

    const column = fieldMap[type];
    if (!column) {
      return new Response(JSON.stringify({ error: "Unknown metric type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.rpc("increment_user_metric", {
      p_user_id: user_id,
      p_workspace_id: workspace_id,
      p_column: column,
    });

    if (error) {
      console.error("Error incrementing metric:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in metrics-update:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});










