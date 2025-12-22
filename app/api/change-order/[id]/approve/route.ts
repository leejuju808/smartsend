// Block 27700 — SmartSend Roofing Change Order Engine v1
// API Route: POST /api/change-order/[id]/approve
// Approve a change order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get change order
    const { data: co, error: coError } = await supabase
      .from("roofing_change_orders")
      .select("id, job_id, workspace_id, status")
      .eq("id", id)
      .single();

    if (coError || !co) {
      return NextResponse.json(
        { error: "Change order not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", co.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update change order status
    const { error: updateError } = await supabase
      .from("roofing_change_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating change order:", updateError);
      return NextResponse.json(
        { error: "Failed to approve change order" },
        { status: 500 }
      );
    }

    // Update revenue record to approved (this triggers the revenue update)
    const { error: revenueError } = await supabase
      .from("roofing_change_order_revenue")
      .update({ approved: true })
      .eq("change_order_id", id);

    if (revenueError) {
      console.error("Error updating revenue:", revenueError);
      // Don't fail the request, but log the error
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in POST /api/change-order/[id]/approve:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































