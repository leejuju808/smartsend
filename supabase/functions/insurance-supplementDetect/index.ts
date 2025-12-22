// Block 19000 — SmartSend AI Insurance Brain v1
// Supplement Detection Worker
// Detects supplement opportunities for insurance claims

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

    console.log(`[Insurance Supplement Detect] Starting run at ${now}`);

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id || null;

    let processed = 0;
    let supplementsDetected = 0;
    let errors = 0;

    if (contactId) {
      // Process single contact
      console.log(`[Insurance Supplement Detect] Processing contact ${contactId}`);

      try {
        // Get recent messages for this contact
        const { data: messages } = await supabase
          .from("inbox_threads")
          .select("body")
          .eq("contact_id", contactId)
          .eq("is_reply", true)
          .order("created_at", { ascending: false })
          .limit(10);

        if (messages && messages.length > 0) {
          const allText = messages.map((m) => m.body || "").join(" ");

          // Detect supplement opportunities
          const { data: result, error: detectError } = await supabase.rpc(
            "detect_supplement_opportunities",
            {
              p_text: allText,
              p_contact_id: contactId,
            }
          );

          if (detectError) {
            throw detectError;
          }

          // Update insurance claims with supplement opportunities
          if (result) {
            const { error: updateError } = await supabase
              .from("insurance_claims")
              .upsert(
                {
                  contact_id: contactId,
                  supplement_potential: (result as any).supplement_potential,
                  supplement_opportunities: (result as any).opportunities,
                },
                {
                  onConflict: "contact_id",
                }
              );

            if (updateError) {
              console.error(`[Insurance Supplement Detect] Error updating claim:`, updateError);
            } else {
              if ((result as any).opportunities?.length > 0) {
                supplementsDetected++;
              }
            }
          }
        }

        processed++;
      } catch (error) {
        console.error(`[Insurance Supplement Detect] Error processing contact ${contactId}:`, error);
        errors++;
      }
    } else {
      // Process all insurance-tagged contacts
      console.log(`[Insurance Supplement Detect] Processing all insurance-tagged contacts`);

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
        console.log(`[Insurance Supplement Detect] No contacts to process`);
        return new Response(
          JSON.stringify({
            ok: true,
            processed: 0,
            supplements_detected: 0,
            errors: 0,
            message: "No contacts to process",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process each contact
      for (const contact of contacts) {
        try {
          // Get recent messages
          const { data: messages } = await supabase
            .from("inbox_threads")
            .select("body")
            .eq("contact_id", contact.id)
            .eq("is_reply", true)
            .order("created_at", { ascending: false })
            .limit(10);

          if (messages && messages.length > 0) {
            const allText = messages.map((m) => m.body || "").join(" ");

            // Detect supplement opportunities
            const { data: result, error: detectError } = await supabase.rpc(
              "detect_supplement_opportunities",
              {
                p_text: allText,
                p_contact_id: contact.id,
              }
            );

            if (!detectError && result) {
              // Update insurance claims
              await supabase
                .from("insurance_claims")
                .upsert(
                  {
                    contact_id: contact.id,
                    supplement_potential: (result as any).supplement_potential,
                    supplement_opportunities: (result as any).opportunities,
                  },
                  {
                    onConflict: "contact_id",
                  }
                );

              if ((result as any).opportunities?.length > 0) {
                supplementsDetected++;
              }
            }
          }

          processed++;
        } catch (error) {
          console.error(`[Insurance Supplement Detect] Error processing contact ${contact.id}:`, error);
          errors++;
        }
      }
    }

    const result = {
      ok: true,
      processed,
      supplements_detected: supplementsDetected,
      errors,
      processed_at: now,
    };

    console.log(`[Insurance Supplement Detect] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Insurance Supplement Detect] Error:", error);
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





















































