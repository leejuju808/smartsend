// Block 62000 — SmartSend Roofing Material Order Creation v1
// Edge Function: /materials-create-order
// 
// Convert forecast → supplier order draft

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
    const { forecast_id, supplier_id, delivery_date, delivery_time, delivery_address, delivery_instructions } = await req.json();

    if (!forecast_id) {
      return new Response(
        JSON.stringify({ error: "forecast_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch forecast
    const { data: forecast, error: forecastError } = await supabase
      .from("material_forecasts")
      .select("*")
      .eq("id", forecast_id)
      .single();

    if (forecastError || !forecast) {
      return new Response(
        JSON.stringify({ error: "Forecast not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch supplier if provided
    let supplierName = "Supplier";
    if (supplier_id) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", supplier_id)
        .single();
      
      if (supplier) {
        supplierName = supplier.name;
      }
    }

    // Convert forecast to order items
    const items = [];
    const forecastData = forecast.forecast;

    // Get material costs for pricing
    const { data: materialCosts } = await supabase
      .from("material_costs")
      .select("*")
      .eq("workspace_id", forecast.workspace_id);

    const costMap = new Map();
    if (materialCosts) {
      materialCosts.forEach(c => {
        costMap.set(`${c.item_name}_${c.unit}`, c);
      });
    }

    // Build items array
    if (forecastData.shingles) {
      const shingles = forecastData.shingles;
      const cost = costMap.get("Shingles_bundles");
      items.push({
        name: "Shingles",
        quantity: shingles.bundles,
        unit: "bundles",
        sku: cost?.sku || "",
        color: shingles.color || "",
        unit_price: cost?.unit_cost || 45.00,
        total_price: (cost?.unit_cost || 45.00) * shingles.bundles
      });
    }

    if (forecastData.ridge_cap) {
      const ridge = forecastData.ridge_cap;
      const cost = costMap.get("Ridge Cap_bundles");
      items.push({
        name: "Ridge Cap",
        quantity: ridge.bundles,
        unit: "bundles",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 35.00,
        total_price: (cost?.unit_cost || 35.00) * ridge.bundles
      });
    }

    if (forecastData.underlayment) {
      const underlayment = forecastData.underlayment;
      const cost = costMap.get("Underlayment_rolls");
      items.push({
        name: "Underlayment",
        quantity: underlayment.rolls,
        unit: "rolls",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 120.00,
        total_price: (cost?.unit_cost || 120.00) * underlayment.rolls
      });
    }

    if (forecastData.ice_water_shield) {
      const iceWater = forecastData.ice_water_shield;
      const cost = costMap.get("Ice & Water Shield_rolls");
      items.push({
        name: "Ice & Water Shield",
        quantity: iceWater.rolls,
        unit: "rolls",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 85.00,
        total_price: (cost?.unit_cost || 85.00) * iceWater.rolls
      });
    }

    if (forecastData.starter_strip) {
      const starter = forecastData.starter_strip;
      const cost = costMap.get("Starter Strip_bundles");
      items.push({
        name: "Starter Strip",
        quantity: starter.bundles,
        unit: "bundles",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 25.00,
        total_price: (cost?.unit_cost || 25.00) * starter.bundles
      });
    }

    if (forecastData.nails) {
      const nails = forecastData.nails;
      const cost = costMap.get("Nails_boxes");
      items.push({
        name: "Nails",
        quantity: nails.boxes,
        unit: "boxes",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 25.00,
        total_price: (cost?.unit_cost || 25.00) * nails.boxes
      });
    }

    if (forecastData.flashing) {
      const flashing = forecastData.flashing;
      const cost = costMap.get("Flashing_linear_feet");
      items.push({
        name: "Flashing",
        quantity: flashing.linear_feet,
        unit: "linear_feet",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 2.50,
        total_price: (cost?.unit_cost || 2.50) * flashing.linear_feet
      });
    }

    if (forecastData.vents) {
      const vents = forecastData.vents;
      const cost = costMap.get("Vents_pieces");
      items.push({
        name: "Vents",
        quantity: vents.pieces,
        unit: "pieces",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 15.00,
        total_price: (cost?.unit_cost || 15.00) * vents.pieces
      });
    }

    if (forecastData.plywood && forecastData.plywood.sheets > 0) {
      const plywood = forecastData.plywood;
      const cost = costMap.get("Plywood_sheets");
      items.push({
        name: "Plywood",
        quantity: plywood.sheets,
        unit: "sheets",
        sku: cost?.sku || "",
        unit_price: cost?.unit_cost || 45.00,
        total_price: (cost?.unit_cost || 45.00) * plywood.sheets
      });
    }

    // Calculate total cost
    const totalCost = items.reduce((sum, item) => sum + item.total_price, 0);

    // Fetch job for delivery address
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("address")
      .eq("id", forecast.job_id)
      .single();

    // Create supplier order
    const orderData = {
      job_id: forecast.job_id,
      forecast_id: forecast_id,
      supplier_id: supplier_id || null,
      workspace_id: forecast.workspace_id,
      supplier_name: supplierName,
      items: items,
      total_cost: totalCost,
      delivery_date: delivery_date || null,
      delivery_time: delivery_time || "anytime",
      delivery_address: delivery_address || job?.address || "",
      delivery_instructions: delivery_instructions || "",
      status: "pending"
    };

    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .insert(orderData)
      .select("id")
      .single();

    if (orderError) throw orderError;

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        items: items,
        total_cost: totalCost
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in materials-create-order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





























