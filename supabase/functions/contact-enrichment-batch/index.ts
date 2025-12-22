/**
 * Block 13400 — Contact Enrichment Batch Job
 * 
 * Daily batch job to enrich contacts missing city, zip, name, or neighborhood
 * Runs nightly to fill gaps in enrichment data
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      throw new Error(`Failed to fetch workspaces: ${workspacesError.message}`);
    }

    if (!workspaces || workspaces.length === 0) {
      return new Response(
        JSON.stringify({ message: "No workspaces found", enriched: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    let totalEnriched = 0;
    const results: Array<{ workspaceId: string; enriched: number }> = [];

    // Process each workspace
    for (const workspace of workspaces) {
      try {
        // Find contacts missing enrichment or with low confidence
        const { data: contacts, error: contactsError } = await supabase
          .from("contacts")
          .select(`
            id,
            email,
            first_name,
            last_name,
            city,
            postal_code,
            state,
            tags,
            workspace_id
          `)
          .eq("workspace_id", workspace.id)
          .limit(100); // Process 100 contacts per workspace per run

        if (contactsError) {
          console.error(
            `Failed to fetch contacts for workspace ${workspace.id}:`,
            contactsError
          );
          continue;
        }

        if (!contacts || contacts.length === 0) {
          continue;
        }

        // Get workspace service area
        const { data: workspaceProfile } = await supabase
          .from("workspace_profile")
          .select("service_areas")
          .eq("workspace_id", workspace.id)
          .maybeSingle();

        const serviceArea = workspaceProfile?.service_areas || [];

        let workspaceEnriched = 0;

        // Enrich each contact
        for (const contact of contacts) {
          try {
            // Check if enrichment already exists and is recent
            const { data: existingEnrichment } = await supabase
              .from("contact_enrichment")
              .select("last_enriched_at, city_confidence, zip_confidence, name_confidence")
              .eq("contact_id", contact.id)
              .maybeSingle();

            // Skip if enriched recently (within last 7 days) and has good confidence
            if (existingEnrichment?.last_enriched_at) {
              const lastEnriched = new Date(existingEnrichment.last_enriched_at);
              const daysSinceEnrichment =
                (Date.now() - lastEnriched.getTime()) / (1000 * 60 * 60 * 24);
              
              if (
                daysSinceEnrichment < 7 &&
                (existingEnrichment.city_confidence >= 0.7 ||
                  existingEnrichment.zip_confidence >= 0.7 ||
                  existingEnrichment.name_confidence >= 0.7)
              ) {
                continue; // Skip this contact
              }
            }

            // Call enrichment API endpoint (Next.js API route)
            // Note: This assumes NEXT_PUBLIC_APP_URL is set, or use a relative URL
            const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
            const enrichResponse = await fetch(
              `${appUrl}/api/contacts/enrich-batch`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  contact_id: contact.id,
                  workspace_id: workspace.id,
                }),
              }
            );

            if (!enrichResponse.ok) {
              const errorText = await enrichResponse.text();
              console.error(
                `Failed to enrich contact ${contact.id}:`,
                errorText
              );
              continue;
            }

            workspaceEnriched++;
            totalEnriched++;
          } catch (error) {
            console.error(
              `Error enriching contact ${contact.id}:`,
              error
            );
            continue;
          }
        }

        results.push({
          workspaceId: workspace.id,
          enriched: workspaceEnriched,
        });
      } catch (error) {
        console.error(
          `Error processing workspace ${workspace.id}:`,
          error
        );
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Batch enrichment completed",
        totalEnriched,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Batch enrichment error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Batch enrichment failed",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

