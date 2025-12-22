// Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
// Edge Function: financing/create-options
// Generates 3-5 financing options for a proposal

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// Default financing providers with typical APRs
const FINANCING_PROVIDERS = [
  { name: "Enhancify", apr: 0.099, link: "https://enhancify.com/apply" },
  { name: "Service Finance", apr: 0.109, link: "https://servicefinance.com/apply" },
  { name: "Sunlight Financial", apr: 0.089, link: "https://sunlightfinancial.com/apply" },
  { name: "GreenSky", apr: 0.119, link: "https://greensky.com/apply" },
  { name: "Acorn", apr: 0.104, link: "https://acornfinance.com/apply" },
];

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
    const { proposal_id, total_price, workspace_id, terms = [24, 36, 60, 120] } = await req.json();

    // Validation
    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (!total_price || typeof total_price !== "number" || total_price <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid total_price is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get proposal to verify it exists and get workspace_id
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, workspace_id, total_price")
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const finalWorkspaceId = workspace_id || proposal.workspace_id;
    const finalPrice = total_price || proposal.total_price;

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

    // Delete existing financing options for this proposal
    await supabase
      .from("financing_options")
      .delete()
      .eq("proposal_id", proposal_id);

    // Generate financing options
    const options = [];
    let displayOrder = 0;

    // Create options for each provider with different terms
    for (const provider of FINANCING_PROVIDERS.slice(0, 5)) {
      // Create option for each term
      for (const term of terms) {
        // Calculate monthly payment
        const monthlyRate = provider.apr / 12;
        const loanAmount = finalPrice; // Assuming no down payment for these options
        const monthlyPayment = (monthlyRate * loanAmount) / 
                              (1 - Math.pow(1 + monthlyRate, -term));
        const roundedMonthly = Math.round(monthlyPayment * 100) / 100;

        // Build lender link with pre-filled data
        const lenderLink = `${provider.link}?amount=${finalPrice}&term=${term}`;

        options.push({
          proposal_id,
          workspace_id: finalWorkspaceId,
          total_price: finalPrice,
          apr: provider.apr,
          term_months: term,
          down_payment: 0,
          monthly_payment: roundedMonthly,
          lender_name: provider.name,
          lender_link: lenderLink,
          display_order: displayOrder++,
          is_active: true,
        });
      }
    }

    // Insert financing options
    const { data: insertedOptions, error: insertError } = await supabase
      .from("financing_options")
      .insert(options)
      .select();

    if (insertError) {
      console.error("Error inserting financing options:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create financing options" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        proposal_id,
        options: insertedOptions,
        count: insertedOptions?.length || 0,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error creating financing options:", err);
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
































