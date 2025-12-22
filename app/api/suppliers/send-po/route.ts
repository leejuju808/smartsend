// Block 24340 — Supplier Communication Engine
// API Route: Send Purchase Order to Supplier
// POST /api/suppliers/send-po

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

    // Verify user has access to this workspace
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

    // Build email subject and body
    const subject = `Purchase Order — ${job.title || "Roofing Job"}`;
    
    const addressParts = [
      job.address,
      job.city,
      job.state,
      job.zip
    ].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "N/A";

    const body = `Hello ${supplier.contact_name || supplier.name},

We are placing a material order for the following job:

Job Name: ${job.title || "N/A"}
Site Address: ${fullAddress}
Requested Delivery Date: ${order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString() : "TBD"}

Materials:
${order.notes || "See attached order details"}

${order.po_number ? `PO Number: ${order.po_number}\n` : ""}
Please confirm receipt and provide an estimated delivery time.

Thank you,
SmartSend Automated System`;

    // Create communication record using database function
    const { data: commData, error: commError } = await supabase.rpc(
      "send_po_to_supplier",
      { p_material_order_id: material_order_id }
    );

    if (commError) {
      console.error("Error creating communication record:", commError);
      return NextResponse.json(
        { error: "Failed to create communication record" },
        { status: 500 }
      );
    }

    // Send email via Gmail
    try {
      await gmailSendThroughWorkspace(order.workspace_id, {
        to: supplier.email,
        subject,
        html: body.replace(/\n/g, "<br>"),
      });

      // Update communication status
      await supabase
        .from("supplier_communications")
        .update({
          status: "delivered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", commData);
    } catch (emailError: any) {
      console.error("Error sending email:", emailError);
      
      // Update communication status to failed
      await supabase
        .from("supplier_communications")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", commData);

      return NextResponse.json(
        { error: `Failed to send email: ${emailError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      communication_id: commData,
      message: "PO sent successfully",
    });
  } catch (error: any) {
    console.error("Error in send-po:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































