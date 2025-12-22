// Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
// Edge Function: payments/get-status
// Gets payment status for a homeowner or contractor view

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const planId = url.searchParams.get("plan_id");
    const jobId = url.searchParams.get("job_id");
    const proposalId = url.searchParams.get("proposal_id");
    const homeownerId = url.searchParams.get("homeowner_id");

    // Validation - need at least one identifier
    if (!planId && !jobId && !proposalId && !homeownerId) {
      return new Response(
        JSON.stringify({ error: "plan_id, job_id, proposal_id, or homeowner_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Build query
    let query = supabase
      .from("payment_plans")
      .select(`
        *,
        payment_plan_payments (*)
      `);

    if (planId) {
      query = query.eq("id", planId);
    } else if (jobId) {
      query = query.eq("job_id", jobId);
    } else if (proposalId) {
      query = query.eq("proposal_id", proposalId);
    } else if (homeownerId) {
      query = query.eq("homeowner_id", homeownerId);
    }

    const { data: paymentPlans, error: plansError } = await query;

    if (plansError) {
      console.error("Error fetching payment plans:", plansError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch payment status" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Calculate summary statistics
    const summary = paymentPlans?.map((plan) => {
      const payments = plan.payment_plan_payments || [];
      const totalPayments = payments.length;
      const paidPayments = payments.filter((p) => p.paid).length;
      const overduePayments = payments.filter(
        (p) => !p.paid && new Date(p.due_date) < new Date()
      ).length;
      const upcomingPayments = payments.filter(
        (p) => !p.paid && new Date(p.due_date) >= new Date()
      ).length;
      
      const totalPaid = payments
        .filter((p) => p.paid)
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      
      const totalRemaining = payments
        .filter((p) => !p.paid)
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      return {
        ...plan,
        summary: {
          total_payments: totalPayments,
          paid_payments: paidPayments,
          overdue_payments: overduePayments,
          upcoming_payments: upcomingPayments,
          total_paid: Math.round(totalPaid * 100) / 100,
          total_remaining: Math.round(totalRemaining * 100) / 100,
          completion_percent: totalPayments > 0 
            ? Math.round((paidPayments / totalPayments) * 100) 
            : 0,
        },
      };
    }) || [];

    return new Response(
      JSON.stringify({
        ok: true,
        payment_plans: summary,
        count: summary.length,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error getting payment status:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
































