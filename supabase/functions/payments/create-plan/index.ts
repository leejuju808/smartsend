// Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
// Edge Function: payments/create-plan
// Creates an in-house payment plan for a job/proposal

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
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const {
      job_id,
      proposal_id,
      homeowner_id,
      workspace_id,
      contractor_id,
      down_payment = 0,
      total_amount,
      number_of_payments,
      apr = null,
      start_date,
      terms,
    } = await req.json();

    // Validation
    if (!job_id && !proposal_id) {
      return new Response(
        JSON.stringify({ error: "job_id or proposal_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (!total_amount || typeof total_amount !== "number" || total_amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid total_amount is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (!number_of_payments || typeof number_of_payments !== "number" || number_of_payments <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid number_of_payments is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get workspace_id from job or proposal if not provided
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId) {
      if (job_id) {
        const { data: job } = await supabase
          .from("jobs")
          .select("workspace_id")
          .eq("id", job_id)
          .single();
        if (job) finalWorkspaceId = job.workspace_id;
      } else if (proposal_id) {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("workspace_id")
          .eq("id", proposal_id)
          .single();
        if (proposal) finalWorkspaceId = proposal.workspace_id;
      }
    }

    if (!finalWorkspaceId) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Calculate monthly payment
    const loanAmount = Math.max(total_amount - down_payment, 0);
    let monthlyPayment = 0;

    if (loanAmount > 0) {
      if (apr && apr > 0) {
        const aprDecimal = apr > 1 ? apr / 100 : apr;
        const monthlyRate = aprDecimal / 12;
        monthlyPayment = (monthlyRate * loanAmount) / 
                        (1 - Math.pow(1 + monthlyRate, -number_of_payments));
      } else {
        // Simple division if no APR
        monthlyPayment = loanAmount / number_of_payments;
      }
      monthlyPayment = Math.round(monthlyPayment * 100) / 100;
    }

    // Generate payment schedule
    const startDate = start_date ? new Date(start_date) : new Date();
    const schedule = [];
    
    for (let i = 1; i <= number_of_payments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      // Adjust last payment for rounding
      let paymentAmount = monthlyPayment;
      if (i === number_of_payments) {
        const previousTotal = monthlyPayment * (number_of_payments - 1);
        paymentAmount = loanAmount - previousTotal;
        paymentAmount = Math.round(paymentAmount * 100) / 100;
      }

      schedule.push({
        due_date: dueDate.toISOString().split('T')[0],
        amount: paymentAmount,
        payment_number: i,
      });
    }

    // Create payment plan
    const { data: paymentPlan, error: planError } = await supabase
      .from("payment_plans")
      .insert({
        job_id: job_id || null,
        proposal_id: proposal_id || null,
        homeowner_id: homeowner_id || null,
        workspace_id: finalWorkspaceId,
        contractor_id: contractor_id || null,
        down_payment,
        total_amount,
        number_of_payments,
        apr: apr ? (apr > 1 ? apr / 100 : apr) : null,
        monthly_payment: monthlyPayment,
        schedule: schedule,
        status: "active",
        terms,
      })
      .select()
      .single();

    if (planError) {
      console.error("Error creating payment plan:", planError);
      return new Response(
        JSON.stringify({ error: "Failed to create payment plan" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Create payment records
    const paymentRecords = schedule.map((item) => ({
      plan_id: paymentPlan.id,
      amount: item.amount,
      due_date: item.due_date,
      payment_number: item.payment_number,
      paid: false,
    }));

    const { error: paymentsError } = await supabase
      .from("payment_plan_payments")
      .insert(paymentRecords);

    if (paymentsError) {
      console.error("Error creating payment records:", paymentsError);
      // Continue anyway - plan is created
    }

    return new Response(
      JSON.stringify({
        ok: true,
        payment_plan: paymentPlan,
        payments_created: paymentRecords.length,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error creating payment plan:", err);
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
































