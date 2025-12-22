// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/export-pdf
// Generates PDF version of proposal

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const { proposal_id } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*),
        contractor:profiles!proposals_contractor_id_fkey(*),
        line_items:proposal_price_line_items(*),
        upsells_data:proposal_upsells(*)
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Generate PDF using a PDF library (e.g., puppeteer, pdfkit, etc.)
    // For now, return a placeholder
    // In production, you would:
    // 1. Render proposal HTML
    // 2. Convert to PDF
    // 3. Upload to storage
    // 4. Update proposal.pdf_url

    const pdf_url = `https://storage.supabase.co/proposals/${proposal_id}.pdf`;

    // Update proposal with PDF URL
    await supabase
      .from("proposals")
      .update({
        pdf_url,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", proposal_id);

    return new Response(
      JSON.stringify({ 
        proposal_id,
        pdf_url,
        note: "PDF generation placeholder - implement actual PDF generation",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-export-pdf:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































