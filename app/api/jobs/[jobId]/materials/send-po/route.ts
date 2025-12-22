// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Generate and send Purchase Order to supplier

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const { material_order_id, roofer_company_name, roofer_contact_phone } = body;

    if (!material_order_id) {
      return NextResponse.json(
        { error: "Missing material_order_id" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from("material_orders")
      .select("*, job_id, workspace_id, supplier_id")
      .eq("id", material_order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", order.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get supplier
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", order.supplier_id)
      .single();

    if (!supplier || !supplier.email) {
      return NextResponse.json(
        { error: "Supplier email not found" },
        { status: 400 }
      );
    }

    // Generate PO using database function
    const { data: poId, error: poError } = await supabase.rpc(
      "generate_purchase_order",
      {
        p_material_order_id: material_order_id,
        p_roofer_company_name: roofer_company_name || null,
        p_roofer_contact_phone: roofer_contact_phone || null,
      }
    );

    if (poError) {
      console.error("Error generating PO:", poError);
      return NextResponse.json(
        { error: poError.message || "Failed to generate PO" },
        { status: 500 }
      );
    }

    // Get the generated PO
    const { data: purchaseOrder } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", poId)
      .single();

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: "Failed to retrieve generated PO" },
        { status: 500 }
      );
    }

    // Get job details for email
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("title, lead_id")
      .eq("id", order.job_id)
      .single();

    // Get takeoff for material list
    const { data: takeoff } = await supabase
      .from("material_takeoffs")
      .select("*")
      .eq("job_id", order.job_id)
      .maybeSingle();

    // Build email content
    const materialList = purchaseOrder.material_list || [];
    const materialListText = materialList
      .map(
        (item: any) =>
          `  • ${item.description || "Material"}: ${item.quantity || 0} ${item.unit || "each"}`
      )
      .join("\n");

    const emailSubject = `Purchase Order ${purchaseOrder.po_number} - ${job?.title || "Roofing Job"}`;
    const emailBody = `Dear ${supplier.name || "Supplier"},

Please find below the purchase order details:

PO Number: ${purchaseOrder.po_number}
Job: ${job?.title || "Roofing Job"}
Delivery Date: ${purchaseOrder.delivery_date || "TBD"}
Delivery Address: ${purchaseOrder.delivery_address || "Job Site"}

Materials:
${materialListText || "See attached PO for details"}

${purchaseOrder.notes ? `Notes: ${purchaseOrder.notes}` : ""}

Please confirm receipt of this order by replying to this email.

Thank you,
${roofer_company_name || "Roofer"}`;

    // TODO: Send email via your email service (Resend, SendGrid, etc.)
    // For now, we'll just mark it as sent
    // In production, integrate with your email service:
    // await sendEmail({
    //   to: supplier.email,
    //   subject: emailSubject,
    //   body: emailBody,
    //   attachments: [/* PDF if generated */]
    // });

    // Update PO with sent status
    await supabase
      .from("purchase_orders")
      .update({
        sent_to_email: supplier.email,
        sent_at: new Date().toISOString(),
      })
      .eq("id", poId);

    return NextResponse.json({
      success: true,
      po_id: poId,
      po_number: purchaseOrder.po_number,
      email_sent_to: supplier.email,
      email_subject: emailSubject,
      email_body: emailBody,
    });
  } catch (error: any) {
    console.error("Error sending PO:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































