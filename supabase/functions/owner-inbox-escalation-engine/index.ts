/**
 * Block 24780 — SmartSend Roofing Owner Inbox Escalation Engine
 * Runs escalation checks every 30 minutes
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    // Run escalation engine for all workspaces
    const { error } = await supabase.rpc("run_owner_inbox_escalation_engine", {
      p_workspace_id: null, // null = all workspaces
    });

    if (error) {
      console.error("Error running escalation engine:", error);
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Escalation engine ran successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Owner inbox escalation engine error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});






































