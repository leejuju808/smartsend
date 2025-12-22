// Block 62000 — SmartSend Roofing Material Cost Updater v1
// Edge Function: /materials-update-cost
// 
// Owner updates material pricing

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workspace_id, item_name, unit, unit_cost, supplier_id, brand, model, color, sku } = await req.json();

    if (!workspace_id || !item_name || !unit || unit_cost === undefined) {
      return new Response(
        JSON.stringify({ error: "workspace_id, item_name, unit, and unit_cost are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if cost record exists
    const { data: existing } = await supabase
      .from("material_costs")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("item_name", item_name)
      .eq("unit", unit)
      .eq("supplier_id", supplier_id || "00000000-0000-0000-0000-000000000000")
      .single();

    let previousCost = null;
    let costChangePercent = null;

    if (existing) {
      previousCost = existing.unit_cost;
      if (previousCost && previousCost > 0) {
        costChangePercent = ((unit_cost - previousCost) / previousCost) * 100;
      }

      // Update existing record
      const { data, error } = await supabase
        .from("material_costs")
        .update({
          unit_cost: unit_cost,
          previous_cost: previousCost,
          cost_change_percent: costChangePercent,
          brand: brand || existing.brand,
          model: model || existing.model,
          color: color || existing.color,
          sku: sku || existing.sku,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;

      // Create cost increase alert if significant
      if (costChangePercent && costChangePercent > 10) {
        await supabase
          .from("material_alerts")
          .insert({
            workspace_id: workspace_id,
            alert_type: "cost_increase",
            severity: "medium",
            message: `${item_name} cost increased by ${costChangePercent.toFixed(1)}% ($${previousCost.toFixed(2)} → $${unit_cost.toFixed(2)})`,
            details: {
              item_name: item_name,
              previous_cost: previousCost,
              new_cost: unit_cost,
              change_percent: costChangePercent
            }
          });
      }

      return new Response(
        JSON.stringify({
          success: true,
          cost_id: data.id,
          previous_cost: previousCost,
          cost_change_percent: costChangePercent
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      // Create new record
      const { data, error } = await supabase
        .from("material_costs")
        .insert({
          workspace_id: workspace_id,
          item_name: item_name,
          unit: unit,
          unit_cost: unit_cost,
          supplier_id: supplier_id || null,
          brand: brand || null,
          model: model || null,
          color: color || null,
          sku: sku || null
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          cost_id: data.id
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error in materials-update-cost:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





























