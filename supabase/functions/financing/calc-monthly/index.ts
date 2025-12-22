// Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
// Edge Function: financing/calc-monthly
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { price, apr, term_months, down_payment = 0 } = await req.json();

    // Validation
    if (!price || typeof price !== "number" || price <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid price is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (!term_months || typeof term_months !== "number" || term_months <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid term_months is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Default APR if not provided (9.9%)
    const defaultApr = apr !== undefined ? apr : 0.099;
    
    // Validate APR (should be between 0 and 1 for decimal, or 0-100 for percentage)
    const aprDecimal = defaultApr > 1 ? defaultApr / 100 : defaultApr;
    
    if (aprDecimal < 0 || aprDecimal > 1) {
      return new Response(
        JSON.stringify({ error: "APR must be between 0 and 100 (or 0 and 1 as decimal)" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Validate down payment
    const downPayment = down_payment || 0;
    if (downPayment < 0 || downPayment > price) {
      return new Response(
        JSON.stringify({ error: "Down payment must be between 0 and price" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Calculate loan amount after down payment
    const loanAmount = Math.max(price - downPayment, 0);

    // Calculate monthly payment using standard loan formula
    // P = (r * PV) / (1 - (1 + r)^(-n))
    // where P = payment, r = monthly rate, PV = present value, n = number of payments
    let monthlyPayment = 0;
    let totalPayoff = 0;

    if (loanAmount > 0) {
      const monthlyRate = aprDecimal / 12;
      
      if (monthlyRate > 0) {
        monthlyPayment = (monthlyRate * loanAmount) / 
                        (1 - Math.pow(1 + monthlyRate, -term_months));
      } else {
        // If APR is 0, just divide loan amount by term
        monthlyPayment = loanAmount / term_months;
      }
      
      // Round to 2 decimal places
      monthlyPayment = Math.round(monthlyPayment * 100) / 100;
      
      // Calculate total payoff (monthly payment * number of payments + down payment)
      totalPayoff = (monthlyPayment * term_months) + downPayment;
      totalPayoff = Math.round(totalPayoff * 100) / 100;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        price,
        apr: aprDecimal,
        term_months,
        down_payment: downPayment,
        loan_amount: loanAmount,
        monthly_payment: monthlyPayment,
        total_payoff: totalPayoff,
        total_interest: Math.round((totalPayoff - price) * 100) / 100,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error calculating monthly payment:", err);
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
































