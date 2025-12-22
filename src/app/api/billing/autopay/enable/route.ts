// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/autopay/enable
// Enable auto-pay for an invoice or payment plan

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
      invoice_id,
      payment_plan_id,
      payment_method_id,
      trigger_days_before = 0, // Days before due date to charge
    } = body;

    if (!payment_method_id) {
      return NextResponse.json(
        { error: "Missing required field: payment_method_id" },
        { status: 400 }
      );
    }

    if (!invoice_id && !payment_plan_id) {
      return NextResponse.json(
        { error: "Must provide either invoice_id or payment_plan_id" },
        { status: 400 }
      );
    }

    // Get payment method
    const { data: method, error: methodError } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", payment_method_id)
      .single();

    if (methodError || !method) {
      return NextResponse.json(
        { error: "Payment method not found" },
        { status: 404 }
      );
    }

    let next_charge_at: string | null = null;
    let homeowner_id: string;
    let workspace_id: string;

    if (invoice_id) {
      // Get invoice details
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("homeowner_id, workspace_id, due_date")
        .eq("id", invoice_id)
        .single();

      if (invoiceError || !invoice) {
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 }
        );
      }

      homeowner_id = invoice.homeowner_id || method.homeowner_id;
      workspace_id = invoice.workspace_id || method.workspace_id;

      if (invoice.due_date) {
        const dueDate = new Date(invoice.due_date);
        dueDate.setDate(dueDate.getDate() - trigger_days_before);
        next_charge_at = dueDate.toISOString();
      }
    } else {
      // Get payment plan details
      const { data: plan, error: planError } = await supabase
        .from("payment_plans")
        .select("homeowner_id, workspace_id, schedule")
        .eq("id", payment_plan_id)
        .single();

      if (planError || !plan) {
        return NextResponse.json(
          { error: "Payment plan not found" },
          { status: 404 }
        );
      }

      homeowner_id = plan.homeowner_id;
      workspace_id = plan.workspace_id;

      // Get first unpaid installment date
      const schedule = plan.schedule as any[];
      const nextInstallment = schedule.find((item: any) => item.status === "pending");
      if (nextInstallment?.date) {
        const installDate = new Date(nextInstallment.date);
        installDate.setDate(installDate.getDate() - trigger_days_before);
        next_charge_at = installDate.toISOString();
      }
    }

    // Check if auto-pay rule already exists
    const { data: existingRule } = await supabase
      .from("auto_pay_rules")
      .select("*")
      .eq("method_id", payment_method_id)
      .eq("status", "active")
      .or(
        invoice_id ? `invoice_id.eq.${invoice_id}` : `payment_plan_id.eq.${payment_plan_id}`
      )
      .maybeSingle();

    if (existingRule) {
      // Update existing rule
      const { data: updatedRule, error: updateError } = await supabase
        .from("auto_pay_rules")
        .update({
          status: "active",
          trigger_days_before,
          next_charge_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRule.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update auto-pay rule", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        auto_pay_rule: updatedRule,
      });
    }

    // Create new auto-pay rule
    const { data: rule, error: ruleError } = await supabase
      .from("auto_pay_rules")
      .insert({
        method_id: payment_method_id,
        invoice_id: invoice_id || null,
        payment_plan_id: payment_plan_id || null,
        homeowner_id,
        workspace_id,
        status: "active",
        trigger_type: invoice_id ? "invoice_due" : "payment_plan_installment",
        trigger_days_before,
        next_charge_at,
      })
      .select()
      .single();

    if (ruleError) {
      console.error("Error creating auto-pay rule:", ruleError);
      return NextResponse.json(
        { error: "Failed to create auto-pay rule", details: ruleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      auto_pay_rule: rule,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/autopay/enable:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























