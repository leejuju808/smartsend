// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Dismiss a material shortage alert

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; alertId: string }> }
) {
  try {
    const { alertId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get alert to verify access
    const { data: alert, error: alertError } = await supabase
      .from("material_shortage_alerts")
      .select("workspace_id")
      .eq("id", alertId)
      .single();

    if (alertError || !alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", alert.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update alert status to dismissed
    const { error: updateError } = await supabase
      .from("material_shortage_alerts")
      .update({ status: "dismissed" })
      .eq("id", alertId);

    if (updateError) {
      console.error("Error dismissing alert:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to dismiss alert" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error dismissing alert:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































