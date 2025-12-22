// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Edge Function: /po/mark-delivered
// 
// Moves PO status → "delivered" and logs timestamp

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

    const { po_id } = await req.json();

    if (!po_id) {
      return new Response(
        JSON.stringify({ error: "po_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update PO status to delivered
    const { data: updatedPo, error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        status: "delivered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", po_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating PO:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update purchase order", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!updatedPo) {
      return new Response(
        JSON.stringify({ error: "Purchase order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get PO items
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("po_id", po_id);

    // Optionally: Add materials to inventory when PO is delivered
    // This can be enabled if you want auto-add to inventory on delivery
    if (items && items.length > 0) {
      // For each item, find matching material and add to inventory
      for (const item of items) {
        const { data: materials } = await supabase
          .from("materials")
          .select("id, name")
          .ilike("name", `%${item.material_name}%`)
          .limit(1);

        if (materials && materials.length > 0) {
          const material = materials[0];
          // Create positive adjustment
          await supabase.from("material_adjustments").insert({
            material_id: material.id,
            job_id: updatedPo.job_id,
            adjustment: item.quantity,
            reason: `PO delivery: ${updatedPo.supplier_name}`,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        purchase_order: updatedPo,
        items: items,
        message: "Purchase order marked as delivered",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in po-mark-delivered:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































