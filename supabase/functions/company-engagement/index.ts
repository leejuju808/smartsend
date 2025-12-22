// supabase/functions/company-engagement/index.ts
// Computes engagement scores for all companies based on email events

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch all companies
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

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ message: "No companies found", processed: 0 }),
        { headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const company of companies) {
      try {
        // Get all leads for this company
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("id")
          .eq("company_id", company.id);

        if (leadsError) {
          console.error(`Error fetching leads for company ${company.id}:`, leadsError);
          errors++;
          continue;
        }

        let score = 0;

        // Count email events for all leads in this company
        if (leads && leads.length > 0) {
          const leadIds = leads.map((l) => l.id);

          // Count events across all leads
          const { data: events, error: eventsError } = await supabase
            .from("email_events")
            .select("id", { count: "exact", head: true })
            .in("lead_id", leadIds);

          if (eventsError) {
            console.error(`Error counting events for company ${company.id}:`, eventsError);
            errors++;
            continue;
          }

          score = events?.length ?? 0;
        }

        // Update company engagement score
        const { error: updateError } = await supabase
          .from("companies")
          .update({ engagement_score: score })
          .eq("id", company.id);

        if (updateError) {
          console.error(`Error updating company ${company.id}:`, updateError);
          errors++;
          continue;
        }

        processed++;
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
        total: companies.length,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Company engagement computation error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unexpected error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});












