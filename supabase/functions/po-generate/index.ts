// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Edge Function: /po/generate
// 
// Creates PO, PO items, and generates PDF
// Inputs: job_id, supplier, delivery_date, items

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

    const {
      job_id,
      supplier_name,
      delivery_date,
      delivery_window,
      items, // Array of { material_name, quantity, unit }
      company_id,
    } = await req.json();

    if (!supplier_name || !delivery_date || !items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "supplier_name, delivery_date, and items array are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create purchase order
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        job_id: job_id || null,
        supplier_name,
        delivery_date,
        delivery_window: delivery_window || "anytime",
        status: "pending",
        company_id: company_id || null,
      })
      .select()
      .single();

    if (poError) {
      console.error("Error creating PO:", poError);
      return new Response(
        JSON.stringify({ error: "Failed to create purchase order", details: poError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create PO items
    const poItems = items.map((item: any) => ({
      po_id: po.id,
      material_name: item.material_name,
      quantity: parseFloat(item.quantity),
      unit: item.unit || "each",
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from("purchase_order_items")
      .insert(poItems)
      .select();

    if (itemsError) {
      console.error("Error creating PO items:", itemsError);
      // Rollback PO creation
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      return new Response(
        JSON.stringify({ error: "Failed to create PO items", details: itemsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate PDF (placeholder - in production, use a PDF generation library)
    // For now, we'll return a URL that can be generated later
    const pdfUrl = `${supabaseUrl}/storage/v1/object/public/po-pdfs/${po.id}.pdf`;

    // Update PO with PDF URL (will be generated asynchronously)
    await supabase
      .from("purchase_orders")
      .update({ pdf_url: pdfUrl })
      .eq("id", po.id);

    // Get job details if job_id provided
    let jobDetails = null;
    if (job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, lead_id, stage")
        .eq("id", job_id)
        .single();

      if (!job) {
        const { data: roofingJob } = await supabase
          .from("roofing_jobs")
          .select("id, lead_id, status")
          .eq("id", job_id)
          .single();
        jobDetails = roofingJob;
      } else {
        jobDetails = job;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        purchase_order: {
          ...po,
          pdf_url: pdfUrl,
        },
        items: insertedItems,
        job: jobDetails,
        message: "Purchase order created successfully. PDF generation pending.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in po-generate:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































