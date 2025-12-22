// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

/**
 * Auto-winner selection cron job
 * Runs ~hourly to check templates with experiment_config.auto_select_winner = true
 * and select winners based on performance thresholds
 */
Deno.serve(async () => {
  try {
    // Get all templates with auto-select enabled
    const { data: templates, error: templatesError } = await supabase
      .from("templates")
      .select("id, experiment_config, created_at")
      .not("experiment_config", "is", null);

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch templates", details: templatesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No templates with experiment config" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let winnersSelected = 0;

    for (const template of templates) {
      const config = template.experiment_config;
      
      // Check if auto-select is enabled
      if (!config || config.auto_select_winner !== true) {
        continue;
      }

      // Extract config values
      const minSendsPerVariant = config.min_sends_per_variant || 50;
      const minTotalSends = config.min_sends || 200;
      const minRuntimeHours = config.min_runtime_hours || 48;

      // Call the RPC function to select winner
      const { data: winnerId, error: selectError } = await supabase.rpc(
        "select_experiment_winner",
        {
          p_template_id: template.id,
          p_min_sends_per_variant: minSendsPerVariant,
          p_min_total_sends: minTotalSends,
          p_min_runtime_hours: minRuntimeHours,
        }
      );

      if (selectError) {
        console.error(`Error selecting winner for template ${template.id}:`, selectError);
        continue;
      }

      processed++;

      if (winnerId) {
        winnersSelected++;
        console.log(`Selected winner ${winnerId} for template ${template.id}`);
      }
    }

    // Refresh the materialized view to update stats
    const { error: refreshError } = await supabase.rpc("refresh_template_variant_stats");

    if (refreshError) {
      console.error("Error refreshing variant stats:", refreshError);
      // Don't fail the whole job if refresh fails
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        winnersSelected,
        message: `Processed ${processed} templates, selected ${winnersSelected} winners`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in select-experiment-winners:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});








