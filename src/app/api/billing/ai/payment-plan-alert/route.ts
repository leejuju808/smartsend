// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/ai/payment-plan-alert
// AI alerts: "This job may need a payment plan"

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json();
    const { job_id, workspace_id } = body;

    if (!job_id && !workspace_id) {
      return NextResponse.json(
        { error: "Must provide job_id or workspace_id" },
        { status: 400 }
      );
    }

    let jobs: any[] = [];

    if (job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      if (job) jobs = [job];
    } else {
      const { data: allJobs } = await supabase
        .from("jobs")
        .select("*")
        .eq("workspace_id", workspace_id);

      jobs = allJobs || [];
    }

    const alerts: Array<{
      job_id: string;
      recommendation: string;
      reason: string;
      confidence: number;
    }> = [];

    for (const job of jobs) {
      const contractValue = Number(job.contract_value) || 0;

      // Check if payment plan already exists
      const { data: existingPlan } = await supabase
        .from("payment_plans")
        .select("*")
        .eq("job_id", job.id)
        .maybeSingle();

      if (existingPlan) {
        continue; // Skip if plan already exists
      }

      // AI logic: Recommend payment plan if:
      // 1. Contract value > $10,000
      // 2. No deposit collected yet
      // 3. Job is in early stages

      let recommendation = "";
      let reason = "";
      let confidence = 0;

      if (contractValue > 10000) {
        // Check for deposit
        const { data: depositInvoice } = await supabase
          .from("invoices")
          .select("*")
          .eq("job_id", job.id)
          .eq("type", "deposit")
          .maybeSingle();

        if (!depositInvoice || depositInvoice.status !== "paid") {
          recommendation = "payment_plan";
          reason = `Large job ($${contractValue.toLocaleString()}) - consider payment plan to improve cashflow`;
          confidence = 0.8;
        }
      } else if (contractValue > 5000) {
        // Check homeowner payment history
        const { data: homeownerInvoices } = await supabase
          .from("invoices")
          .select(`
            *,
            jobs:job_id (
              lead_id
            )
          `)
          .eq("jobs.lead_id", job.lead_id);

        const hasLatePayments = (homeownerInvoices || []).some(
          (inv) => inv.status === "overdue"
        );

        if (hasLatePayments) {
          recommendation = "payment_plan";
          reason = "Homeowner has history of late payments - payment plan may improve collection";
          confidence = 0.7;
        }
      }

      if (recommendation) {
        alerts.push({
          job_id: job.id,
          recommendation,
          reason,
          confidence,
        });
      }
    }

    return NextResponse.json({
      success: true,
      alerts,
      total_alerts: alerts.length,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/ai/payment-plan-alert:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























