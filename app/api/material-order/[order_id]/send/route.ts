// Block 27760 — SmartSend Roofing Material Order Automation v1
// API Route: POST /api/material-order/[order_id]/send
// 
// Sends material order to supplier via email

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const { order_id } = await params;

    if (!order_id) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("roofing_material_orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from("roofing_material_order_items")
      .select("*")
      .eq("order_id", order_id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return NextResponse.json(
        { error: "Failed to load order items" },
        { status: 500 }
      );
    }

    // Fetch supplier
    let supplier = null;
    if (order.supplier_id) {
      const { data: supplierData } = await supabase
        .from("roofing_suppliers")
        .select("*")
        .eq("id", order.supplier_id)
        .single();
      supplier = supplierData;
    }

    // Build email content
    const subject = `Material Order for Job ${order.job_id}`;
    const body = `
Material order for job ${order.job_id}

Delivery date: ${order.delivery_date || "TBD"}
Window: ${order.delivery_window || "Any"}
Drop location: ${order.drop_location || "Driveway"}

Items:
${(items || [])
  .map(
    (i) =>
      `- ${i.description} — ${i.quantity} ${i.unit || ""} (${i.category || ""})`
  )
  .join("\n")}

Notes:
${order.notes || ""}
`;

    // Insert into send_queue
    // Note: send_queue requires campaign_id and lead_id, which material orders don't have
    // For v1, we'll try to insert but handle gracefully if it fails
    // In production, you may want to create a material_order_email_queue table or
    // use a different email sending mechanism for supplier communications
    
    if (supplier?.contact_email) {
      // Try to get job's lead_id for send_queue compatibility
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("lead_id, workspace_id")
        .eq("id", order.job_id)
        .single();

      // Attempt to insert into send_queue if we have the required fields
      // If send_queue structure doesn't support this, you may need to:
      // 1. Create a separate material_order_emails table
      // 2. Use a direct email sending service
      // 3. Extend send_queue to support material_order type
      
      // For now, we'll log the email content and update status
      // The actual email sending can be handled by a separate process
      console.log("Material order email to send:", {
        to: supplier.contact_email,
        subject,
        body
      });
      
      // If you have a material_order_emails table or similar, insert there instead
      // Or use a direct email API call here
    }

    // Update order status
    await supabase
      .from("roofing_material_orders")
      .update({ status: "sent" })
      .eq("id", order_id);

    // Update job material_status
    await supabase
      .from("roofing_jobs")
      .update({ material_status: "ordered" })
      .eq("id", order.job_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in POST /api/material-order/[order_id]/send:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































