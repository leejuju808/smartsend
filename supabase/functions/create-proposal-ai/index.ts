// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// Edge Function: /create-proposal-ai
// 
// Generates AI-powered roofing proposals from lead and job data

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
    const { lead_id, job_details, workspace_id, contractor_id } = await req.json();

    if (!lead_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "lead_id and workspace_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job details if job_id provided
    let job = null;
    if (job_details?.job_id) {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job_details.job_id)
        .single();
      job = jobData;
    }

    // Build AI prompt
    const prompt = `Generate a professional roofing proposal for the following customer details:

Homeowner: ${lead.first_name || ''} ${lead.last_name || ''}
Email: ${lead.email || ''}
Phone: ${lead.phone || ''}
Address: ${lead.address || lead.custom?.address || 'Not provided'}

Roof Type: ${job_details?.roof_type || 'Not specified'}
Job Description: ${job_details?.scope || job?.notes || 'Standard roof replacement'}
Price Range: $${job_details?.price || job?.contract_value || 'TBD'}
Warranty: ${job_details?.warranty || 'Standard manufacturer warranty'}
Insurance Job: ${job_details?.insurance || job?.insurance ? 'Yes' : 'No'}
Storm Related: ${job_details?.storm_job ? 'Yes' : 'No'}

${job_details?.measurements ? `Measurements: ${JSON.stringify(job_details.measurements)}` : ''}

Generate a professional, homeowner-friendly proposal in Markdown format with the following sections:
1. Introduction - Warm, personalized greeting
2. Scope of Work - Clear description of what will be done
3. Deliverables - What the homeowner receives
4. Timeline - Expected completion time
5. Investment - Clear pricing breakdown
6. Payment Terms - Deposit and payment schedule
7. Warranty Explanation - What's covered and for how long
8. Next Steps - How to proceed

Make it professional, trustworthy, and easy to understand. Use clear language that builds confidence.`;

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
            content: "You are a professional roofing proposal writer. Create clear, professional, and trustworthy proposals that help homeowners make informed decisions.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
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
    const content = openaiData.choices?.[0]?.message?.content || "";

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create proposal
    const proposalTitle = `Roof Replacement Proposal for ${lead.first_name || ''} ${lead.last_name || ''}`;
    
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        lead_id,
        job_id: job_details?.job_id || job?.id || null,
        contractor_id: contractor_id || null,
        workspace_id,
        title: proposalTitle,
        content,
        price: job_details?.price || job?.contract_value || null,
        status: "draft",
        version: 1,
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

    // Save version history
    await supabase
      .from("proposal_versions")
      .insert({
        proposal_id: proposal.id,
        version: 1,
        content,
      });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        proposal,
        message: "Proposal generated successfully"
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Error in create-proposal-ai:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

































