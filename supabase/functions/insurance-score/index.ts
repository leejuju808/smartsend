// Block 19000 — SmartSend AI Insurance Brain v1
// Insurance Score Worker
// Calculates and updates insurance probability scores for contacts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date().toISOString();

    console.log(`[Insurance Score] Starting run at ${now}`);

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id || null;
    const workspaceId = body?.workspace_id || null;

    let processed = 0;
    let scored = 0;
    let errors = 0;

    if (contactId) {
      // Process single contact
      console.log(`[Insurance Score] Processing contact ${contactId}`);

      try {
        const { error: scoreError } = await supabase.rpc(
          "calculate_insurance_probability_score_v2",
          {
            p_contact_id: contactId,
          }
        );

        if (scoreError) {
          throw scoreError;
        }

        // Run comprehensive intelligence analysis
        const { error: intelError } = await supabase.rpc(
          "analyze_insurance_intelligence",
          {
            p_contact_id: contactId,
            p_text: null,
          }
        );

        if (intelError) {
          console.error(`[Insurance Score] Error analyzing intelligence:`, intelError);
        }

        scored++;
        processed++;
      } catch (error) {
        console.error(`[Insurance Score] Error processing contact ${contactId}:`, error);
        errors++;
      }
    } else {
      // Process all contacts with recent activity
      console.log(`[Insurance Score] Processing contacts with recent activity`);

      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id, workspace_id")
        .not("workspace_id", "is", null)
        .limit(100);

      if (contactsError) {
        throw contactsError;
      }

      if (!contacts || contacts.length === 0) {
        console.log(`[Insurance Score] No contacts to process`);
        return new Response(
          JSON.stringify({
            ok: true,
            processed: 0,
            scored: 0,
            errors: 0,
            message: "No contacts to process",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process each contact
      for (const contact of contacts) {
        try {
          const { error: scoreError } = await supabase.rpc(
            "calculate_insurance_probability_score_v2",
            {
              p_contact_id: contact.id,
            }
          );

          if (scoreError) {
            throw scoreError;
          }

          scored++;
          processed++;
        } catch (error) {
          console.error(`[Insurance Score] Error processing contact ${contact.id}:`, error);
          errors++;
        }
      }
    }

    const result = {
      ok: true,
      processed,
      scored,
      errors,
      processed_at: now,
    };

    console.log(`[Insurance Score] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Insurance Score] Error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































