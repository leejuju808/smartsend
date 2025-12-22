// Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
// Edge Function: /kpi-nightly-snapshot
// Runs nightly at 2 AM to calculate and save KPI snapshots for all companies/workspaces

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { company_id, workspace_id, org_id, date } = await req.json().catch(() => ({}));
    
    // Default to yesterday's date (snapshot for completed day)
    const snapshotDate = date ? new Date(date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateString = snapshotDate.toISOString().split('T')[0];

    // If specific IDs provided, calculate for those only
    if (company_id || workspace_id || org_id) {
      const { data, error } = await supabase.rpc('calculate_daily_kpi_snapshot', {
        p_company_id: company_id || null,
        p_workspace_id: workspace_id || null,
        p_org_id: org_id || null,
        p_date: dateString
      });

      if (error) {
        throw new Error(`Error calculating snapshot: ${error.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          snapshot_id: data,
          date: dateString,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Otherwise, calculate for all active companies/workspaces
    const results: any[] = [];

    // Get all active roofing companies
    const { data: companies, error: companiesError } = await supabase
      .from("roofing_companies")
      .select("id, workspace_id, org_id")
      .eq("is_active", true);

    if (companiesError) {
      console.error("Error fetching companies:", companiesError);
    } else if (companies) {
      for (const company of companies) {
        try {
          const { data, error } = await supabase.rpc('calculate_daily_kpi_snapshot', {
            p_company_id: company.id,
            p_workspace_id: company.workspace_id,
            p_org_id: company.org_id,
            p_date: dateString
          });

          if (error) {
            console.error(`Error calculating snapshot for company ${company.id}:`, error);
          } else {
            results.push({ company_id: company.id, snapshot_id: data });
          }
        } catch (err) {
          console.error(`Error processing company ${company.id}:`, err);
        }
      }
    }

    // Get all active workspaces (that don't have a company)
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("is_active", true)
      .not("id", "in", companies?.map(c => c.workspace_id).filter(Boolean) || []);

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
    } else if (workspaces) {
      for (const workspace of workspaces) {
        try {
          const { data, error } = await supabase.rpc('calculate_daily_kpi_snapshot', {
            p_company_id: null,
            p_workspace_id: workspace.id,
            p_org_id: workspace.org_id,
            p_date: dateString
          });

          if (error) {
            console.error(`Error calculating snapshot for workspace ${workspace.id}:`, error);
          } else {
            results.push({ workspace_id: workspace.id, snapshot_id: data });
          }
        } catch (err) {
          console.error(`Error processing workspace ${workspace.id}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: dateString,
        snapshots_created: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in nightly KPI snapshot:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});



























