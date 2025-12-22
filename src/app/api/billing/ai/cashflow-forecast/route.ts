// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/ai/cashflow-forecast
// AI forecasts revenue collection for next 30, 60, 90 days

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json();
    const { workspace_id, days = 30 } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
        { status: 400 }
      );
    }

    // Get all pending invoices
    const { data: invoices, error: invoicesError } = await supabase
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
        ),
        transactions (
          id,
          amount,
          status,
          created_at
        )
      `)
      .eq("workspace_id", workspace_id)
      .in("status", ["pending", "partially_paid", "overdue"]);

    if (invoicesError) {
      console.error("Error fetching invoices:", invoicesError);
      return NextResponse.json(
        { error: "Failed to fetch invoices", details: invoicesError.message },
        { status: 500 }
      );
    }

    // Calculate historical payment patterns
    const { data: historicalPayments } = await supabase
      .from("transactions")
      .select(`
        *,
        invoices:invoice_id (
          due_date
        )
      `)
      .eq("status", "succeeded")
      .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    // Calculate average days to pay
    const paymentDelays = (historicalPayments || [])
      .filter((t: any) => t.invoices?.due_date)
      .map((t: any) => {
        const paidDate = new Date(t.created_at);
        const dueDate = new Date(t.invoices.due_date);
        return Math.max(0, Math.floor((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      });

    const avgDaysToPay = paymentDelays.length > 0
      ? paymentDelays.reduce((sum, d) => sum + d, 0) / paymentDelays.length
      : 7; // Default to 7 days

    // Forecast collection by day
    const today = new Date();
    const forecast: Array<{ date: string; expected_amount: number; confidence: number }> = [];

    for (let i = 0; i < days; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(forecastDate.getDate() + i);
      const dateStr = forecastDate.toISOString().split("T")[0];

      let expectedAmount = 0;
      let confidence = 0.5;

      // Find invoices likely to be paid on this date
      for (const invoice of invoices || []) {
        if (!invoice.due_date) continue;

        const dueDate = new Date(invoice.due_date);
        const expectedPaymentDate = new Date(dueDate);
        expectedPaymentDate.setDate(expectedPaymentDate.getDate() + avgDaysToPay);

        // Check if this invoice might be paid on forecast date
        const daysFromDue = Math.floor((forecastDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysFromExpected = Math.abs(Math.floor((forecastDate.getTime() - expectedPaymentDate.getTime()) / (1000 * 60 * 60 * 24)));

        if (daysFromExpected <= 3) {
          // High confidence if within 3 days of expected payment
          const totalPaid = (invoice.transactions || [])
            .filter((t: any) => t.status === "succeeded")
            .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
          const amountDue = Number(invoice.amount) - totalPaid;

          if (amountDue > 0) {
            expectedAmount += amountDue * (1 - daysFromExpected / 10); // Decay confidence
            confidence = Math.max(confidence, 1 - daysFromExpected / 10);
          }
        }
      }

      forecast.push({
        date: dateStr,
        expected_amount: Math.round(expectedAmount * 100) / 100,
        confidence: Math.min(1, confidence),
      });
    }

    // Calculate totals
    const totalExpected = forecast.reduce((sum, f) => sum + f.expected_amount, 0);
    const totalOutstanding = (invoices || []).reduce((sum, inv) => {
      const totalPaid = (inv.transactions || [])
        .filter((t: any) => t.status === "succeeded")
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      return sum + (Number(inv.amount) - totalPaid);
    }, 0);

    // AI insights
    const insights = [
      totalExpected < totalOutstanding * 0.5
        ? "Forecast shows lower collection rate - consider payment reminders"
        : "Forecast shows healthy collection rate",
      avgDaysToPay > 14
        ? "Average payment delay is high - consider earlier invoice delivery"
        : "Payment timing is within normal range",
      (invoices || []).filter((inv) => inv.status === "overdue").length > 0
        ? "You have overdue invoices - prioritize collections"
        : "No overdue invoices - good cashflow health",
    ];

    return NextResponse.json({
      success: true,
      forecast: {
        period_days: days,
        total_expected: totalExpected,
        total_outstanding: totalOutstanding,
        collection_rate: totalOutstanding > 0 ? (totalExpected / totalOutstanding) * 100 : 0,
        average_days_to_pay: Math.round(avgDaysToPay),
        daily_forecast: forecast,
        insights,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/ai/cashflow-forecast:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























