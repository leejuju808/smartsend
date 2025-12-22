// Block 240000 — SmartSend Roofing Billing & Payments Hub
// PATCH /api/billing/payment-plan/[id]
// Update payment plan

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { schedule, auto_pay, payment_method_id } = body;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (schedule !== undefined) {
      updateData.schedule = schedule;
    }

    if (auto_pay !== undefined) {
      updateData.auto_pay = auto_pay;
    }

    if (payment_method_id !== undefined) {
      updateData.payment_method_id = payment_method_id;
    }

    const { data: plan, error } = await supabase
      .from("payment_plans")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating payment plan:", error);
      return NextResponse.json(
        { error: "Failed to update payment plan", details: error.message },
        { status: 500 }
      );
    }

    // Update auto-pay rules if needed
    if (auto_pay !== undefined) {
      if (auto_pay && payment_method_id) {
        // Enable auto-pay
        await supabase
          .from("auto_pay_rules")
          .upsert({
            method_id: payment_method_id,
            payment_plan_id: id,
            homeowner_id: plan.homeowner_id,
            workspace_id: plan.workspace_id,
            status: "active",
            trigger_type: "payment_plan_installment",
            trigger_days_before: 0,
          });
      } else {
        // Disable auto-pay
        await supabase
          .from("auto_pay_rules")
          .update({ status: "cancelled" })
          .eq("payment_plan_id", id);
      }
    }

    return NextResponse.json({
      success: true,
      payment_plan: plan,
    });
  } catch (error: any) {
    console.error("Error in PATCH /api/billing/payment-plan/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























