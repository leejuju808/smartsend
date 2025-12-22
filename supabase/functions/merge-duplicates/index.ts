import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment configuration");
}

serve(async (req) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const { leadId, duplicateId, reason, userId } = await req.json();

    if (!leadId || !duplicateId) {
      return new Response(
        JSON.stringify({ error: "leadId and duplicateId are required" }),
        { status: 400, headers }
      );
    }

    if (leadId === duplicateId) {
      return new Response(
        JSON.stringify({ error: "leadId and duplicateId must be different" }),
        { status: 400, headers }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const tables = ["messages", "followups", "reply_logs", "events"];
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .update({ lead_id: leadId })
        .eq("lead_id", duplicateId);

      if (error) {
        throw new Error(`Failed to update ${table}: ${error.message}`);
      }
    }

    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({ status: "merged", merged_into: leadId })
      .eq("id", duplicateId);

    if (leadUpdateError) {
      throw new Error(`Failed to mark duplicate lead: ${leadUpdateError.message}`);
    }

    const { error: logError } = await supabase.from("lead_merges").insert({
      master_lead_id: leadId,
      merged_lead_id: duplicateId,
      reason: reason ?? null,
      merged_by: userId ?? null,
    });

    if (logError) {
      throw new Error(`Failed to log merge: ${logError.message}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers,
    });
  }
});



