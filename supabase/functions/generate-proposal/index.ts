// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// Edge Function: /generate-proposal
// 
// Generates AI-powered roofing proposals with Good/Better/Best options

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      job_id,
      lead_id,
      workspace_id,
      squares,
      pitch = "medium",
      material = "asphalt",
      insurance = false,
      addons = {},
    } = await req.json();

    if (!job_id && !lead_id) {
      return new Response(
        JSON.stringify({ error: "job_id or lead_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!squares || squares <= 0) {
      return new Response(
        JSON.stringify({ error: "squares must be a positive number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead details
    let lead = null;
    if (lead_id) {
      const { data: leadData } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();
      lead = leadData;
    } else if (job_id) {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("*, leads:lead_id(*)")
        .eq("id", job_id)
        .single();
      if (jobData?.leads) {
        lead = Array.isArray(jobData.leads) ? jobData.leads[0] : jobData.leads;
      }
    }

    // Calculate pricing using the pricing engine
    const { data: pricingResult, error: pricingError } = await supabase.rpc(
      "calculate_proposal_pricing",
      {
        p_workspace_id: workspace_id,
        p_squares: squares,
        p_pitch: pitch,
        p_material_type: material,
        p_insurance: insurance,
        p_addons: addons,
      }
    );

    if (pricingError) {
      console.error("Pricing calculation error:", pricingError);
      return new Response(
        JSON.stringify({ error: "Failed to calculate pricing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { good_price, better_price, best_price } = pricingResult;

    // Build AI prompt for Good/Better/Best options
    const prompt = `Generate a professional roofing proposal with three options: Good, Better, and Best.

Customer Details:
- Name: ${lead?.first_name || ""} ${lead?.last_name || ""}
- Address: ${lead?.address || lead?.custom?.address || "Not provided"}
- Roof Size: ${squares} squares
- Pitch: ${pitch}
- Material Type: ${material}
- Insurance Job: ${insurance ? "Yes" : "No"}

Pricing:
- Good Option: $${good_price.toLocaleString()}
- Better Option: $${better_price.toLocaleString()}
- Best Option: $${best_price.toLocaleString()}

Add-ons: ${JSON.stringify(addons)}

Generate a comprehensive proposal with the following structure for EACH option (Good, Better, Best):

GOOD OPTION:
- Materials: Builder-grade shingles, standard underlayment, basic ventilation
- Warranty: 3-year workmanship warranty
- Value explanation: Clear, budget-friendly option
- Scope of work: Complete roof replacement with standard materials

BETTER OPTION:
- Materials: Architectural shingles, synthetic underlayment, ridge vent
- Warranty: 5-10 year warranty
- Value explanation: Better quality and longer-lasting
- Scope of work: Enhanced materials and ventilation

BEST OPTION:
- Materials: Premium shingles, upgraded ice & water shield, metal accents
- Warranty: Lifetime warranty
- Value explanation: Maximum protection and premium finish
- Scope of work: Full ventilation redesign, premium materials throughout

For each option, include:
1. Clear description of materials and workmanship
2. Warranty details
3. Timeline (typically 1-3 days)
4. Payment terms
5. Why this option is valuable

Also include:
- Company story/branding
- Scope of work details
- Exclusions
- Timeline
- Next steps

Make it professional, trustworthy, and help homeowners understand the value of each option.`;

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a professional roofing proposal writer. Create clear, professional proposals with Good/Better/Best options that help homeowners make informed decisions. Always structure your response as JSON with 'good_option', 'better_option', and 'best_option' keys, each containing 'title', 'description', 'materials', 'warranty', 'value_explanation', 'scope_of_work', 'timeline', and 'price' fields.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 3000,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate proposal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    let proposalContent;
    
    try {
      proposalContent = JSON.parse(openaiData.choices?.[0]?.message?.content || "{}");
    } catch (e) {
      // Fallback if JSON parsing fails
      const rawContent = openaiData.choices?.[0]?.message?.content || "";
      proposalContent = {
        good_option: {
          title: "Good Option",
          description: rawContent,
          price: good_price,
        },
        better_option: {
          title: "Better Option",
          description: rawContent,
          price: better_price,
        },
        best_option: {
          title: "Best Option",
          description: rawContent,
          price: best_price,
        },
      };
    }

    // Ensure prices are set
    proposalContent.good_option = {
      ...proposalContent.good_option,
      price: good_price,
    };
    proposalContent.better_option = {
      ...proposalContent.better_option,
      price: better_price,
    };
    proposalContent.best_option = {
      ...proposalContent.best_option,
      price: best_price,
    };

    // Create proposal record
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        job_id: job_id || null,
        lead_id: lead_id || null,
        workspace_id,
        good_option: proposalContent.good_option,
        better_option: proposalContent.better_option,
        best_option: proposalContent.best_option,
        status: "draft",
        quote_data: {
          squares,
          pitch,
          material,
          insurance,
          addons,
          pricing: pricingResult,
        },
      })
      .select()
      .single();

    if (proposalError) {
      console.error("Error creating proposal:", proposalError);
      return new Response(
        JSON.stringify({ error: "Failed to create proposal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create line items for each option
    const lineItems = [
      {
        proposal_id: proposal.id,
        option_tier: "good",
        item_name: "Roof Replacement - Good Package",
        item_description: "Builder-grade shingles, standard underlayment, basic ventilation",
        quantity: squares,
        unit: "square",
        unit_price: good_price / squares,
        total_price: good_price,
        category: "materials",
        sort_order: 1,
      },
      {
        proposal_id: proposal.id,
        option_tier: "better",
        item_name: "Roof Replacement - Better Package",
        item_description: "Architectural shingles, synthetic underlayment, ridge vent",
        quantity: squares,
        unit: "square",
        unit_price: better_price / squares,
        total_price: better_price,
        category: "materials",
        sort_order: 1,
      },
      {
        proposal_id: proposal.id,
        option_tier: "best",
        item_name: "Roof Replacement - Best Package",
        item_description: "Premium shingles, upgraded ice & water shield, metal accents",
        quantity: squares,
        unit: "square",
        unit_price: best_price / squares,
        total_price: best_price,
        category: "materials",
        sort_order: 1,
      },
    ];

    await supabase.from("proposal_line_items").insert(lineItems);

    return new Response(
      JSON.stringify({
        ok: true,
        proposal,
        message: "Proposal generated successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-proposal:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































