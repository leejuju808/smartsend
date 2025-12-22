// Block 62000 — SmartSend Roofing Material Order Sender API v1
// POST /api/materials/send-order
// Email or SMS supplier with PO

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { order_id, send_via } = body;

    if (!order_id) {
      return NextResponse.json({ error: "order_id is required" }, { status: 400 });
    }

    // Verify user has access to this order
    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .select("workspace_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/materials-send-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        order_id,
        send_via
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to send order", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/materials/send-order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/materials/send-order
// 
// Email or SMS supplier with PO

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const { order_id, send_via = "email" } = body;

    if (!order_id) {
      return NextResponse.json(
        { error: "Missing order_id" },
        { status: 400 }
      );
    }

    // Fetch order with related data
    const { data: order, error: orderError } = await supabase
      .from("supplier_orders")
      .select(`
        *,
        suppliers (*),
        roofing_jobs (id, title, address, homeowner_name),
        material_forecasts (forecast)
      `)
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Check workspace access
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

    // Get workspace info for email
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", order.workspace_id)
      .single();

    if (send_via === "email" && order.suppliers?.email) {
      // Build email content
      const itemsList = (order.items as any[] || [])
        .map(
          (item) =>
            `• ${item.item_name || item.description}: ${item.quantity} ${item.unit} @ $${item.unit_cost?.toFixed(2) || "0.00"} = $${item.total_cost?.toFixed(2) || "0.00"}`
        )
        .join("\n");

      const emailContent = `
Purchase Order: ${order.po_number}
Job: ${order.roofing_jobs?.title || "N/A"}
Delivery Address: ${order.delivery_address || order.roofing_jobs?.address || "N/A"}
Delivery Date: ${order.delivery_date}
Delivery Time: ${order.delivery_time || "Anytime"}

Materials Required:
${itemsList}

Total: $${order.total_cost?.toFixed(2) || "0.00"}

${order.delivery_instructions ? `Delivery Instructions: ${order.delivery_instructions}` : ""}

Please confirm receipt and delivery date/time.

Thank you,
${workspace?.name || "SmartSend Customer"}
      `.trim();

      // Send email via Resend
      try {
        const emailResult = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "noreply@smartsend.ai",
          to: order.suppliers.email,
          subject: `Purchase Order ${order.po_number} - ${order.roofing_jobs?.title || "Material Order"}`,
          text: emailContent,
          html: `<pre style="font-family: sans-serif;">${emailContent.replace(/\n/g, "<br>")}</pre>`,
        });

        // Update order status
        const { error: updateError } = await supabase
          .from("supplier_orders")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            sent_via: "email",
            sent_to_email: order.suppliers.email,
          })
          .eq("id", order_id);

        if (updateError) {
          console.error("Error updating order status:", updateError);
        }

        return NextResponse.json({
          success: true,
          message: "Purchase order sent via email",
          email_id: emailResult.data?.id,
        });
      } catch (emailError: any) {
        console.error("Error sending email:", emailError);
        return NextResponse.json(
          { error: `Failed to send email: ${emailError.message}` },
          { status: 500 }
        );
      }
    } else if (send_via === "sms" && order.suppliers?.phone) {
      // TODO: Implement SMS sending (Twilio, etc.)
      return NextResponse.json(
        { error: "SMS sending not yet implemented" },
        { status: 501 }
      );
    } else {
      return NextResponse.json(
        { error: "Supplier email or phone not found" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error in POST /api/materials/send-order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























