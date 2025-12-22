// Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Edge Function — Update Material Order Status
// 
// Purpose: Let roofers update an order's status → SmartSend logs it automatically into the timeline
//
// Input: { order_id, status, message }
// Output: { ok: true }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { order_id, status, message } = await req.json();

    if (!order_id || !status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: order_id and status" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate status
    const validStatuses = ['ordered', 'en_route', 'delivered', 'delayed', 'canceled'];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update the order itself
    const { error: updateError } = await supabase
      .from("material_orders")
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq("id", order_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log timeline event (this will also trigger the database trigger)
    const { error: insertError } = await supabase
      .from("material_order_updates")
      .insert({
        material_order_id: order_id,
        status: status,
        message: message || null
      });

    if (insertError) {
      console.error("Error inserting material_order_updates:", insertError);
      // Don't fail the request if timeline logging fails
    }

    // Sync job material status (update roofing_jobs.material_status)
    const { data: order } = await supabase
      .from("material_orders")
      .select("job_id")
      .eq("id", order_id)
      .single();

    if (order?.job_id) {
      await supabase.rpc("sync_job_material_status", { p_job_id: order.job_id });
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});







































