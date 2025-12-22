import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// Rate limit: process max 100 leads per run to avoid API cost spikes
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  // Optional: Add cron secret check for security
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("authorization")?.replace("Bearer ", "");
  
  if (cronSecret && providedSecret !== cronSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    // Find leads that haven't been enriched yet
    // First, get all enriched lead IDs
    const { data: enrichedLeadIds } = await supabase
      .from("lead_enrichment")
      .select("lead_id");
    
    const enrichedIds = enrichedLeadIds?.map(e => e.lead_id) || [];
    
    // Fetch leads, then filter out enriched ones
    const { data: allLeads, error: leadsError } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, title, domain, website, linkedin")
      .limit(BATCH_SIZE * 2); // Fetch more to account for filtering
    
    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch leads", details: leadsError.message }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Filter out already enriched leads
    const leads = (allLeads || []).filter(lead => !enrichedIds.includes(lead.id)).slice(0, BATCH_SIZE);

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No leads to enrich" }),
        {
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Call enrichment function for each lead
    const edgeBaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const enrichmentUrl = `${edgeBaseUrl}/functions/v1/lead-enrichment`;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    let processed = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        const response = await fetch(enrichmentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ lead }),
        });

        if (response.ok) {
          processed++;
        } else {
          console.error(`Failed to enrich lead ${lead.id}:`, await response.text());
          errors++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Error enriching lead ${lead.id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        processed, 
        errors,
        total: leads.length 
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("enrichment-cron error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});

