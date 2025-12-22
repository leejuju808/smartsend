// Block 22320 — SmartSend Roofing Material Delivery & Supplier Tracker v1
// API Route: Create / Update Material Order for a Job
// POST /api/jobs/material-order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      job_id,
      supplier_id,
      po_number,
      status,
      expected_delivery_date,
      notes,
      materials, // Simple text description (Block 22430 spec)
      cost, // Total cost (Block 22430 spec)
      items, // [{id?, description, sku, quantity, unit, unit_price}] (legacy format)
    } = body;

    if (!job_id || !supplier_id) {
      return NextResponse.json(
        { error: "Missing job_id or supplier_id" },
        { status: 400 }
      );
    }

    // Get job & workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // upsert order (for v1: one active order per job)
    const { data: existing, error: existingError } = await supabase
      .from("material_orders")
      .select("id")
      .eq("job_id", job_id)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);
    }

    let orderId = existing?.id;

    if (!orderId) {
      const { data: newOrder, error: insertError } = await supabase
        .from("material_orders")
        .insert({
          workspace_id: job.workspace_id,
          job_id,
          supplier_id,
          po_number,
          status: status || "ordered",
          expected_delivery_date,
          notes: notes || materials || notes, // Support both notes and materials field
          total: cost ? parseFloat(cost.toString()) : null, // Store cost in total field
        })
        .select()
        .single();

      if (insertError) {
        console.error(insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }

      orderId = newOrder.id;
    } else {
      const { error: updateError } = await supabase
        .from("material_orders")
        .update({
          supplier_id,
          po_number,
          status: status || "ordered",
          expected_delivery_date,
          notes: notes || materials || notes, // Support both notes and materials field
          total: cost ? parseFloat(cost.toString()) : null, // Store cost in total field
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (updateError) {
        console.error(updateError);
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    }

    // handle items (legacy format - only if items array is provided)
    if (Array.isArray(items) && items.length > 0) {
      // simplest v1: delete all and re-insert
      await supabase
        .from("material_order_items")
        .delete()
        .eq("material_order_id", orderId);

      const itemsToInsert = items.map((it: any) => ({
        material_order_id: orderId,
        description: it.description,
        sku: it.sku,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        total_price:
          (Number(it.quantity || 0) * Number(it.unit_price || 0)) || null,
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from("material_order_items")
          .insert(itemsToInsert);

        if (itemsError) {
          console.error(itemsError);
          return NextResponse.json(
            { error: itemsError.message },
            { status: 500 }
          );
        }
      }
    } else if (materials) {
      // Block 22430: Simple materials text field - store as a single item for display
      // Delete existing items first
      await supabase
        .from("material_order_items")
        .delete()
        .eq("material_order_id", orderId);

      // Insert materials as a single item description
      const { error: itemsError } = await supabase
        .from("material_order_items")
        .insert({
          material_order_id: orderId,
          description: materials,
          quantity: 1,
        });

      if (itemsError) {
        console.error(itemsError);
        // Don't fail the request if item insertion fails
      }
    }

    // call status sync (trigger should handle this, but call explicitly to be safe)
    await supabase.rpc("sync_job_material_status", { p_job_id: job_id });

    // Trigger reliability recalculation for this supplier (async, don't block response)
    if (supplier_id) {
      // Fire and forget - don't await
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/supplier-compute-reliability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ workspace_id: job.workspace_id }),
      }).catch((err) => {
        console.error("Error triggering reliability computation:", err);
        // Silently fail - reliability will be recalculated on next cron run
      });
    }

    return NextResponse.json(
      { success: true, order_id: orderId },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in material-order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


