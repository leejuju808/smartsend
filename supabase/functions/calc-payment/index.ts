// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Edge Function: calc-payment
// Calculates monthly payment estimates for financing options

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
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const { amount, apr, term_months } = await req.json();

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid amount is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Default APR if not provided (9.9% sample)
    const defaultApr = apr || 0.099;
    // Default terms if not provided
    const defaultTerms = term_months ? [term_months] : [6, 12, 24, 36];

    // Calculate monthly payment for each term
    const results = defaultTerms.map((months: number) => {
      const monthlyRate = defaultApr / 12;
      const payment =
        (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
      return {
        months,
        payment: Math.round(payment * 100) / 100, // Round to 2 decimals
        apr: defaultApr,
        total_amount: Math.round(payment * months * 100) / 100,
      };
    });

    return new Response(
      JSON.stringify({
        ok: true,
        amount,
        estimates: results,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error calculating payment:", err);
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

































