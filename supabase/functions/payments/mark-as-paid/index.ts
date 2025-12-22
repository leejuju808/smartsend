// Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
// Edge Function: payments/mark-as-paid
// Marks a payment as paid and updates payment status

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
      payment_id,
      payment_method,
      payment_reference,
      paid_at,
      notes,
    } = await req.json();

    // Validation
    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: "payment_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get payment to verify it exists
    const { data: payment, error: paymentError } = await supabase
      .from("payment_plan_payments")
      .select("id, plan_id, paid")
      .eq("id", payment_id)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (payment.paid) {
      return new Response(
        JSON.stringify({ error: "Payment is already marked as paid" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Update payment
    const paidAt = paid_at ? new Date(paid_at) : new Date();
    const { data: updatedPayment, error: updateError } = await supabase
      .from("payment_plan_payments")
      .update({
        paid: true,
        paid_at: paidAt.toISOString(),
        payment_method: payment_method || null,
        payment_reference: payment_reference || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating payment:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update payment" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get updated payment plan status
    const { data: paymentPlan } = await supabase
      .from("payment_plans")
      .select("id, status")
      .eq("id", payment.plan_id)
      .single();

    return new Response(
      JSON.stringify({
        ok: true,
        payment: updatedPayment,
        payment_plan_status: paymentPlan?.status || "active",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error marking payment as paid:", err);
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
































