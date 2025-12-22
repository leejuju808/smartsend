// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/ai/payment-prediction
// AI predicts likelihood of late payment

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json();
    const { invoice_id, homeowner_id } = body;

    if (!invoice_id && !homeowner_id) {
      return NextResponse.json(
        { error: "Must provide invoice_id or homeowner_id" },
        { status: 400 }
      );
    }

    let invoice: any = null;
    let homeownerHistory: any[] = [];

    if (invoice_id) {
      // Get invoice
      const { data: inv } = await supabase
        .from("invoices")
        .select(`
          *,
          jobs:job_id (
            id,
            lead_id,
            leads:lead_id (
              id,
              email
            )
          )
        `)
        .eq("id", invoice_id)
        .single();

      invoice = inv;
      if (inv?.jobs?.leads?.id) {
        // Get homeowner payment history
        const { data: history } = await supabase
          .from("invoices")
          .select(`
            *,
            transactions (
              id,
              status,
              created_at
            )
          `)
          .eq("jobs.leads.id", inv.jobs.leads.id)
          .neq("id", invoice_id);

        homeownerHistory = history || [];
      }
    } else if (homeowner_id) {
      // Get all invoices for homeowner
      const { data: history } = await supabase
        .from("invoices")
        .select(`
          *,
          transactions (
            id,
            status,
            created_at
          )
        `)
        .eq("homeowner_id", homeowner_id);

      homeownerHistory = history || [];
    }

    // Calculate payment behavior metrics
    const totalInvoices = homeownerHistory.length;
    const paidOnTime = homeownerHistory.filter((inv) => {
      if (!inv.due_date) return false;
      const paidTransaction = inv.transactions?.find((t: any) => t.status === "succeeded");
      if (!paidTransaction) return false;
      const paidDate = new Date(paidTransaction.created_at);
      const dueDate = new Date(inv.due_date);
      return paidDate <= dueDate;
    }).length;

    const latePayments = homeownerHistory.filter((inv) => {
      if (!inv.due_date) return false;
      const paidTransaction = inv.transactions?.find((t: any) => t.status === "succeeded");
      if (!paidTransaction) return false;
      const paidDate = new Date(paidTransaction.created_at);
      const dueDate = new Date(inv.due_date);
      return paidDate > dueDate;
    }).length;

    const unpaidInvoices = homeownerHistory.filter(
      (inv) => inv.status !== "paid"
    ).length;

    // Calculate average days late
    const latePaymentsData = homeownerHistory.filter((inv) => {
      if (!inv.due_date) return false;
      const paidTransaction = inv.transactions?.find((t: any) => t.status === "succeeded");
      if (!paidTransaction) return false;
      const paidDate = new Date(paidTransaction.created_at);
      const dueDate = new Date(inv.due_date);
      return paidDate > dueDate;
    });

    const avgDaysLate =
      latePaymentsData.length > 0
        ? latePaymentsData.reduce((sum, inv) => {
            const paidTransaction = inv.transactions?.find((t: any) => t.status === "succeeded");
            if (!paidTransaction) return sum;
            const paidDate = new Date(paidTransaction.created_at);
            const dueDate = new Date(inv.due_date);
            return sum + Math.max(0, Math.floor((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
          }, 0) / latePaymentsData.length
        : 0;

    // Predict likelihood of late payment (0-100%)
    let latePaymentLikelihood = 50; // Default

    if (totalInvoices > 0) {
      const onTimeRate = paidOnTime / totalInvoices;
      const lateRate = latePayments / totalInvoices;
      const unpaidRate = unpaidInvoices / totalInvoices;

      // Weighted prediction
      latePaymentLikelihood = Math.round(
        (lateRate * 0.6 + unpaidRate * 0.3 + (avgDaysLate > 7 ? 0.1 : 0)) * 100
      );
    }

    // Risk level
    let riskLevel: "low" | "medium" | "high" = "medium";
    if (latePaymentLikelihood < 30) {
      riskLevel = "low";
    } else if (latePaymentLikelihood > 70) {
      riskLevel = "high";
    }

    return NextResponse.json({
      success: true,
      prediction: {
        late_payment_likelihood: latePaymentLikelihood,
        risk_level: riskLevel,
        metrics: {
          total_invoices: totalInvoices,
          paid_on_time: paidOnTime,
          late_payments: latePayments,
          unpaid_invoices: unpaidInvoices,
          average_days_late: Math.round(avgDaysLate),
        },
        recommendations: [
          latePaymentLikelihood > 70
            ? "Consider requiring deposit or payment plan"
            : latePaymentLikelihood > 50
            ? "Send payment reminder 2 days before due date"
            : "Standard payment terms are appropriate",
          avgDaysLate > 7
            ? "Customer typically pays 7+ days late - consider earlier reminders"
            : "",
        ].filter(Boolean),
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/ai/payment-prediction:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























