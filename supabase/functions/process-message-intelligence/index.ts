// Block 14300 — SmartSend Message Intelligence v1
// Edge Function: process-message-intelligence
// Processes incoming homeowner replies and detects intelligence categories

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  reply_id: string;
  reply_table?: string; // 'inbox_messages', 'reply_messages', 'messages'
  contact_id?: string;
  lead_id?: string;
  force?: boolean; // Force reprocessing even if already processed
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ProcessRequest = await req.json();
    const { reply_id, reply_table = "inbox_messages", contact_id, lead_id, force = false } = body;

    if (!reply_id) {
      return new Response(
        JSON.stringify({ error: "Missing reply_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if already processed (unless force=true)
    if (!force) {
      const { data: existing } = await supabase
        .from("message_insights")
        .select("id")
        .eq("reply_id", reply_id)
        .eq("reply_table", reply_table)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({
            status: "already_processed",
            insight_id: existing.id,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Call the database function to process message intelligence
    const { data: insightId, error: processError } = await supabase.rpc(
      "process_message_intelligence",
      {
        p_reply_id: reply_id,
        p_reply_table: reply_table,
        p_contact_id: contact_id || null,
        p_lead_id: lead_id || null,
      }
    );

    if (processError) {
      console.error("Error processing message intelligence:", processError);
      return new Response(
        JSON.stringify({
          error: "Failed to process message intelligence",
          details: processError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the created insight for response
    const { data: insight, error: fetchError } = await supabase
      .from("message_insights")
      .select("*")
      .eq("id", insightId)
      .single();

    if (fetchError) {
      console.error("Error fetching insight:", fetchError);
      // Still return success since processing completed
      return new Response(
        JSON.stringify({
          status: "processed",
          insight_id: insightId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "success",
        insight_id: insightId,
        insight: insight,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in process-message-intelligence:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































