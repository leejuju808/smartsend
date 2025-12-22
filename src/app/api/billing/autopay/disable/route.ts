// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/autopay/disable
// Disable auto-pay for an invoice or payment plan

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { invoice_id, payment_plan_id } = body;

    if (!invoice_id && !payment_plan_id) {
      return NextResponse.json(
        { error: "Must provide either invoice_id or payment_plan_id" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("auto_pay_rules")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });

    if (invoice_id) {
      query = query.eq("invoice_id", invoice_id);
    } else {
      query = query.eq("payment_plan_id", payment_plan_id);
    }

    const { error } = await query;

    if (error) {
      console.error("Error disabling auto-pay:", error);
      return NextResponse.json(
        { error: "Failed to disable auto-pay", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Auto-pay disabled successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/autopay/disable:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























