// Block 19000 — SmartSend AI Insurance Brain v1
// Approval Likelihood Prediction Worker
// Calculates approval likelihood for insurance claims

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

    console.log(`[Insurance Approval Predict] Starting run at ${now}`);

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id || null;

    let processed = 0;
    let predicted = 0;
    let errors = 0;

    if (contactId) {
      // Process single contact
      console.log(`[Insurance Approval Predict] Processing contact ${contactId}`);

      try {
        const { data: result, error: predictError } = await supabase.rpc(
          "calculate_approval_likelihood",
          {
            p_contact_id: contactId,
          }
        );

        if (predictError) {
          throw predictError;
        }

        // Update insurance claims with approval likelihood
        if (result) {
          const { error: updateError } = await supabase
            .from("insurance_claims")
            .upsert(
              {
                contact_id: contactId,
                approval_likelihood: (result as any).approval_likelihood,
                approval_likelihood_score: (result as any).approval_likelihood_score,
              },
              {
                onConflict: "contact_id",
              }
            );

          if (updateError) {
            console.error(`[Insurance Approval Predict] Error updating claim:`, updateError);
          }
        }

        predicted++;
        processed++;
      } catch (error) {
        console.error(`[Insurance Approval Predict] Error processing contact ${contactId}:`, error);
        errors++;
      }
    } else {
      // Process all insurance-tagged contacts
      console.log(`[Insurance Approval Predict] Processing all insurance-tagged contacts`);

      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id")
        .eq("insurance_tagged", true)
        .not("workspace_id", "is", null)
        .limit(100);

      if (contactsError) {
        throw contactsError;
      }

      if (!contacts || contacts.length === 0) {
        console.log(`[Insurance Approval Predict] No contacts to process`);
        return new Response(
          JSON.stringify({
            ok: true,
            processed: 0,
            predicted: 0,
            errors: 0,
            message: "No contacts to process",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process each contact
      for (const contact of contacts) {
        try {
          const { data: result, error: predictError } = await supabase.rpc(
            "calculate_approval_likelihood",
            {
              p_contact_id: contact.id,
            }
          );

          if (predictError) {
            throw predictError;
          }

          // Update insurance claims
          if (result) {
            await supabase
              .from("insurance_claims")
              .upsert(
                {
                  contact_id: contact.id,
                  approval_likelihood: (result as any).approval_likelihood,
                  approval_likelihood_score: (result as any).approval_likelihood_score,
                },
                {
                  onConflict: "contact_id",
                }
              );
          }

          predicted++;
          processed++;
        } catch (error) {
          console.error(`[Insurance Approval Predict] Error processing contact ${contact.id}:`, error);
          errors++;
        }
      }
    }

    const result = {
      ok: true,
      processed,
      predicted,
      errors,
      processed_at: now,
    };

    console.log(`[Insurance Approval Predict] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Insurance Approval Predict] Error:", error);
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





















































