// Block 228000 — Send Change Order to Homeowner Portal
// POST /api/change-orders/send
// Sends change order to homeowner for approval via portal

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { change_order_id } = await req.json();

    if (!change_order_id) {
      return NextResponse.json(
        { error: "change_order_id is required" },
        { status: 400 }
      );
    }

    // Get change order
    const { data: changeOrder, error: coError } = await supabase
      .from("change_orders")
      .select(`
        *,
        change_order_items (*)
      `)
      .eq("id", change_order_id)
      .single();

    if (coError || !changeOrder) {
      return NextResponse.json(
        { error: "Change order not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", changeOrder.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    if (changeOrder.status !== "draft") {
      return NextResponse.json(
        { error: `Change order is already ${changeOrder.status}` },
        { status: 400 }
      );
    }

    // Update status to 'sent' and set sent_at
    const { error: updateError } = await supabase
      .from("change_orders")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", change_order_id);

    if (updateError) {
      console.error("Error sending change order:", updateError);
      return NextResponse.json(
        { error: "Failed to send change order" },
        { status: 500 }
      );
    }

    // Get job info to find homeowner portal
    const { data: job } = await supabase
      .from("jobs")
      .select("id, lead_id, homeowner_email, homeowner_name")
      .eq("id", changeOrder.job_id)
      .single();

    if (!job) {
      // Try roofing_jobs
      await supabase
        .from("roofing_jobs")
        .select("id, lead_id, homeowner_email, homeowner_name")
        .eq("id", changeOrder.job_id)
        .single();
    }

    return NextResponse.json({
      success: true,
      change_order_id,
      portal_url: `/homeowner/change-order/${changeOrder.portal_token}`,
      portal_token: changeOrder.portal_token,
      message: "Change order sent to homeowner portal",
    });
  } catch (error: any) {
    console.error("Error sending change order:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send change order" },
      { status: 500 }
    );
  }
}

























