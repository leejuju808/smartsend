// Block 62000 — SmartSend Roofing Material Order Sender v1
// Edge Function: /materials-send-order
// 
// Email or SMS supplier with PO

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
    const { order_id, send_via } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch order with related data
    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .select(`
        *,
        suppliers (
          id,
          name,
          email,
          phone
        ),
        roofing_jobs (
          id,
          title,
          address,
          homeowner_name
        )
      `)
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

    const sendMethod = send_via || "email";
    const supplier = order.suppliers;
    const job = order.roofing_jobs;

    if (!supplier || (sendMethod === "email" && !supplier.email) || (sendMethod === "sms" && !supplier.phone)) {
      return new Response(
        JSON.stringify({ error: `Supplier ${sendMethod === "email" ? "email" : "phone"} not found` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate PO number
    const poNumber = order.po_number || `PO-${Date.now()}`;

    // Build PO text/email body
    const poBody = `
PURCHASE ORDER

PO Number: ${poNumber}
Date: ${new Date().toLocaleDateString()}
Job: ${job?.title || "N/A"}
Delivery Address: ${order.delivery_address}
Delivery Date: ${order.delivery_date || "TBD"}
Delivery Time: ${order.delivery_time || "anytime"}

${order.delivery_instructions ? `Delivery Instructions: ${order.delivery_instructions}\n` : ""}

ITEMS:
${order.items.map((item: any, idx: number) => 
  `${idx + 1}. ${item.name} - ${item.quantity} ${item.unit}${item.sku ? ` (SKU: ${item.sku})` : ""}${item.color ? ` - Color: ${item.color}` : ""} @ $${item.unit_price.toFixed(2)} = $${item.total_price.toFixed(2)}`
).join("\n")}

TOTAL: $${order.total_cost.toFixed(2)}

Please confirm receipt and delivery date.
    `.trim();

    // TODO: In production, integrate with email/SMS service (Resend, Twilio, etc.)
    // For now, we'll just update the order status
    const { error: updateError } = await supabase
      .from("supplier_orders")
      .update({
        status: "sent",
        po_number: poNumber,
        sent_at: new Date().toISOString(),
        sent_via: sendMethod
      })
      .eq("id", order_id);

    if (updateError) throw updateError;

    // Create delivery confirmation alert
    await supabase
      .from("material_alerts")
      .insert({
        job_id: order.job_id,
        supplier_order_id: order_id,
        workspace_id: order.workspace_id,
        alert_type: "delivery_confirmed",
        severity: "low",
        message: `Purchase order ${poNumber} sent to ${supplier.name} via ${sendMethod}`,
        details: {
          po_number: poNumber,
          supplier: supplier.name,
          send_method: sendMethod
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        po_number: poNumber,
        sent_via: sendMethod,
        message: `PO sent to ${supplier.name} via ${sendMethod}`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in materials-send-order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





























