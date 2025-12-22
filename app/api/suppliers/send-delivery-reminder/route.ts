// Block 24340 — Supplier Communication Engine
// API Route: Send Delivery Reminder to Supplier (24 hours before)
// POST /api/suppliers/send-delivery-reminder

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";

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
    const { material_order_id } = body;

    if (!material_order_id) {
      return NextResponse.json(
        { error: "Missing material_order_id" },
        { status: 400 }
      );
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select(`
        *,
        suppliers (*),
        roofing_jobs (*)
      `)
      .eq("id", material_order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Material order not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", order.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const supplier = (order as any).suppliers;
    const job = (order as any).roofing_jobs;

    if (!supplier || !supplier.email) {
      return NextResponse.json(
        { error: "Supplier email not found" },
        { status: 400 }
      );
    }

    if (!order.expected_delivery_date) {
      return NextResponse.json(
        { error: "No delivery date set for this order" },
        { status: 400 }
      );
    }

    // Build email
    const subject = `Delivery Reminder — ${job.title || "Roofing Job"}`;
    
    const addressParts = [
      job.address,
      job.city,
      job.state,
      job.zip
    ].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "N/A";

    const deliveryDate = new Date(order.expected_delivery_date).toLocaleDateString();

    const body = `Hello ${supplier.contact_name || supplier.name},

Reminder that materials for the ${job.title || "roofing project"} at ${fullAddress} are scheduled for delivery tomorrow (${deliveryDate}).

Please confirm driver ETA and placement instructions.

Thank you,
SmartSend Automated System`;

    // Create communication record
    const { data: commData, error: commError } = await supabase
      .from("supplier_communications")
      .insert({
        workspace_id: order.workspace_id,
        material_order_id: material_order_id,
        supplier_id: order.supplier_id,
        job_id: order.job_id,
        communication_type: "delivery_reminder",
        subject,
        body,
        recipient_email: supplier.email,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (commError) {
      console.error("Error creating communication record:", commError);
      return NextResponse.json(
        { error: "Failed to create communication record" },
        { status: 500 }
      );
    }

    // Send email
    try {
      await gmailSendThroughWorkspace(order.workspace_id, {
        to: supplier.email,
        subject,
        html: body.replace(/\n/g, "<br>"),
      });

      // Update reminder status
      await supabase
        .from("supplier_delivery_reminders")
        .update({
          reminder_sent_at: new Date().toISOString(),
          communication_id: commData.id,
          status: "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("material_order_id", material_order_id)
        .eq("status", "pending");

      // Update communication status
      await supabase
        .from("supplier_communications")
        .update({
          status: "delivered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", commData.id);
    } catch (emailError: any) {
      console.error("Error sending email:", emailError);
      
      await supabase
        .from("supplier_communications")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", commData.id);

      return NextResponse.json(
        { error: `Failed to send email: ${emailError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      communication_id: commData.id,
      message: "Delivery reminder sent successfully",
    });
  } catch (error: any) {
    console.error("Error in send-delivery-reminder:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































