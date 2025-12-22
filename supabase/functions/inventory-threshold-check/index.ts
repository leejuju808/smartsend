// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Edge Function: /inventory/threshold-check
// 
// Daily cron: Find materials below min_quantity
// Notify owner and suggest PO creation

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name");

    if (companiesError) {
      console.error("Error fetching companies:", companiesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch companies" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alerts = [];

    for (const company of companies || []) {
      // Get low inventory materials for this company
      const { data: lowMaterials, error: lowError } = await supabase
        .rpc("get_low_inventory_materials", { p_company_id: company.id });

      if (lowError) {
        console.error(`Error fetching low inventory for company ${company.id}:`, lowError);
        continue;
      }

      if (lowMaterials && lowMaterials.length > 0) {
        alerts.push({
          company_id: company.id,
          company_name: company.name,
          low_materials: lowMaterials,
          count: lowMaterials.length,
        });
      }
    }

    // In a real implementation, you would:
    // 1. Send email notifications to company owners
    // 2. Create tasks/notifications in the system
    // 3. Suggest PO creation

    return new Response(
      JSON.stringify({
        success: true,
        alerts: alerts,
        total_companies_checked: companies?.length || 0,
        total_alerts: alerts.length,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in inventory-threshold-check:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































