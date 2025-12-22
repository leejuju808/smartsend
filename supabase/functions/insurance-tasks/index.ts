// Block 19000 — SmartSend AI Insurance Brain v1
// Insurance Tasks Worker
// Automatically generates insurance-related tasks based on claim status

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

    console.log(`[Insurance Tasks] Starting run at ${now}`);

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id || null;

    let processed = 0;
    let tasksCreated = 0;
    let errors = 0;

    if (contactId) {
      // Process single contact
      console.log(`[Insurance Tasks] Processing contact ${contactId}`);

      try {
        const { data: result, error: tasksError } = await supabase.rpc(
          "generate_insurance_tasks",
          {
            p_contact_id: contactId,
          }
        );

        if (tasksError) {
          throw tasksError;
        }

        if (result && (result as any).tasks_created) {
          tasksCreated += (result as any).tasks_created;
        }

        processed++;
      } catch (error) {
        console.error(`[Insurance Tasks] Error processing contact ${contactId}:`, error);
        errors++;
      }
    } else {
      // Process all insurance-tagged contacts
      console.log(`[Insurance Tasks] Processing all insurance-tagged contacts`);

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
        console.log(`[Insurance Tasks] No contacts to process`);
        return new Response(
          JSON.stringify({
            ok: true,
            processed: 0,
            tasks_created: 0,
            errors: 0,
            message: "No contacts to process",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process each contact
      for (const contact of contacts) {
        try {
          const { data: result, error: tasksError } = await supabase.rpc(
            "generate_insurance_tasks",
            {
              p_contact_id: contact.id,
            }
          );

          if (tasksError) {
            throw tasksError;
          }

          if (result && (result as any).tasks_created) {
            tasksCreated += (result as any).tasks_created;
          }

          processed++;
        } catch (error) {
          console.error(`[Insurance Tasks] Error processing contact ${contact.id}:`, error);
          errors++;
        }
      }
    }

    const result = {
      ok: true,
      processed,
      tasks_created: tasksCreated,
      errors,
      processed_at: now,
    };

    console.log(`[Insurance Tasks] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Insurance Tasks] Error:", error);
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





















































