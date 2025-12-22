// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/payment-plan/create
// Create a payment plan for splitting large invoices

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
    const {
      homeowner_id,
      job_id,
      workspace_id,
      invoice_id, // Optional: link to original invoice
      total_amount,
      num_payments,
      payment_schedule, // Array of {date, amount} or auto-generate
      auto_pay = false,
      payment_method_id, // Optional: if auto_pay is true
    } = body;

    if (!homeowner_id || !workspace_id || !total_amount || !num_payments) {
      return NextResponse.json(
        { error: "Missing required fields: homeowner_id, workspace_id, total_amount, num_payments" },
        { status: 400 }
      );
    }

    // Generate payment schedule if not provided
    let schedule: any[] = [];
    if (payment_schedule && Array.isArray(payment_schedule)) {
      schedule = payment_schedule.map((item: any, index: number) => ({
        date: item.date,
        amount: Number(item.amount),
        status: "pending",
        installment_number: index + 1,
      }));
    } else {
      // Auto-generate equal payments
      const amountPerPayment = total_amount / num_payments;
      const today = new Date();
      
      for (let i = 0; i < num_payments; i++) {
        const paymentDate = new Date(today);
        paymentDate.setDate(today.getDate() + (i * 30)); // 30 days apart
        
        schedule.push({
          date: paymentDate.toISOString().split('T')[0],
          amount: i === num_payments - 1 
            ? total_amount - (amountPerPayment * (num_payments - 1)) // Last payment gets remainder
            : amountPerPayment,
          status: "pending",
          installment_number: i + 1,
        });
      }
    }

    // Validate schedule amounts sum to total
    const scheduleTotal = schedule.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(scheduleTotal - total_amount) > 0.01) {
      return NextResponse.json(
        { error: "Payment schedule amounts must sum to total_amount" },
        { status: 400 }
      );
    }

    // Create payment plan
    const { data: plan, error: planError } = await supabase
      .from("payment_plans")
      .insert({
        homeowner_id,
        job_id: job_id || null,
        workspace_id,
        invoice_id: invoice_id || null,
        total_amount,
        num_payments,
        schedule: schedule,
        auto_pay,
        payment_method_id: auto_pay ? payment_method_id || null : null,
        status: "active",
      })
      .select()
      .single();

    if (planError) {
      console.error("Error creating payment plan:", planError);
      return NextResponse.json(
        { error: "Failed to create payment plan", details: planError.message },
        { status: 500 }
      );
    }

    // Create auto-pay rule if requested
    if (auto_pay && payment_method_id) {
      await supabase
        .from("auto_pay_rules")
        .insert({
          method_id: payment_method_id,
          payment_plan_id: plan.id,
          homeowner_id,
          workspace_id,
          status: "active",
          trigger_type: "payment_plan_installment",
          trigger_days_before: 0,
          next_charge_at: schedule[0]?.date ? new Date(schedule[0].date).toISOString() : null,
        });
    }

    return NextResponse.json({
      success: true,
      payment_plan: plan,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/payment-plan/create:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























