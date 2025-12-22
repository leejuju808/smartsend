// Block 62000 — SmartSend Roofing Material Delivery Confirmation v1
// Edge Function: /materials-confirm-delivery
// 
// Supplier or contractor confirms delivered materials

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
    const { order_id, delivered_items, notes } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("supplier_orders")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString()
      })
      .eq("id", order_id);

    if (updateError) throw updateError;

    // Check for shortages or discrepancies
    if (delivered_items && Array.isArray(delivered_items)) {
      const shortages = [];
      const overDeliveries = [];

      for (const delivered of delivered_items) {
        const ordered = order.items.find((item: any) => item.name === delivered.name);
        if (ordered) {
          if (delivered.quantity < ordered.quantity) {
            shortages.push({
              item: delivered.name,
              ordered: ordered.quantity,
              delivered: delivered.quantity,
              shortage: ordered.quantity - delivered.quantity
            });
          } else if (delivered.quantity > ordered.quantity * 1.1) {
            overDeliveries.push({
              item: delivered.name,
              ordered: ordered.quantity,
              delivered: delivered.quantity
            });
          }
        }
      }

      // Create alerts for shortages
      if (shortages.length > 0) {
        for (const shortage of shortages) {
          await supabase
            .from("material_alerts")
            .insert({
              job_id: order.job_id,
              supplier_order_id: order_id,
              workspace_id: order.workspace_id,
              alert_type: "shortage",
              severity: "high",
              message: `Shortage detected: ${shortage.shortage} ${shortage.item} missing from delivery`,
              details: shortage
            });
        }

        // Update order
        await supabase
          .from("supplier_orders")
          .update({ shortage_detected: true })
          .eq("id", order_id);
      }
    }

    // Create delivery confirmation alert
    await supabase
      .from("material_alerts")
      .insert({
        job_id: order.job_id,
        supplier_order_id: order_id,
        workspace_id: order.workspace_id,
        alert_type: "delivery_confirmed",
        severity: "low",
        message: `Material delivery confirmed for order ${order.po_number || order_id}`,
        details: {
          delivered_items: delivered_items || order.items,
          notes: notes || ""
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order_id,
        status: "delivered"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in materials-confirm-delivery:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





























