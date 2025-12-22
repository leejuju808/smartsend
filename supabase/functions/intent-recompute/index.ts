// Block 177: Intent Recompute Engine
// Runs hourly/daily to recalculate company intent scores

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_KEY")!
  );

  try {
    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id");

    if (companiesError) {
      console.error("Error fetching companies:", companiesError);
      return new Response(
        JSON.stringify({ error: companiesError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    // Process each company
    for (const company of companies ?? []) {
      try {
        // Get all signals for this company
        const { data: signals, error: signalsError } = await supabase
          .from("intent_signals")
          .select("weight")
          .eq("company_id", company.id);

        if (signalsError) {
          console.error(`Error fetching signals for company ${company.id}:`, signalsError);
          errors++;
          continue;
        }

        // Calculate total intent score
        let total = 0;
        for (const signal of signals ?? []) {
          total += signal.weight || 0;
        }

        // Update company intent score
        const { error: updateError } = await supabase
          .from("companies")
          .update({ intent_score: total })
          .eq("id", company.id);

        if (updateError) {
          console.error(`Error updating company ${company.id}:`, updateError);
          errors++;
        } else {
          // Log to activity_log
          try {
            const { data: companyData } = await supabase
              .from("companies")
              .select("account_id, workspace_id, org_id")
              .eq("id", company.id)
              .maybeSingle();
            
            const account_id = companyData?.account_id || companyData?.workspace_id || companyData?.org_id;
            
            if (account_id) {
              await supabase.from("activity_log").insert({
                account_id,
                company_id: company.id,
                event_type: "company_engagement_update",
                meta: { score: total },
              });
            }
          } catch (activityErr) {
            console.error("Failed to log company engagement update activity:", activityErr);
          }
          
          processed++;
        }
      } catch (err) {
        console.error(`Error processing company ${company.id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        total: companies?.length || 0,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Intent recompute error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

