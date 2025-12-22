// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// Edge Function: Generate Supplement Packet
// Creates a professional supplement document ready to send to adjusters

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.56.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get supplement recommendations
    const { data: items, error: itemsError } = await supabase
      .from("roofing_supplement_recommendations")
      .select("*")
      .eq("job_id", job_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("Error fetching recommendations:", itemsError);
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No pending supplement recommendations found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total estimated cost
    const totalEstimated = items.reduce((sum, item) => {
      return sum + (item.estimated_cost || 0);
    }, 0);

    // Build AI prompt to generate professional supplement packet
    const prompt = `Create a professional insurance supplement packet for a roofing claim.

This is a formal document that will be sent to an insurance adjuster. It should be:
- Professional and respectful
- Clear and concise
- Well-organized with proper sections
- Include all necessary details
- Cite code requirements where applicable

Include the following sections:
1. Header with job information (homeowner name, address, claim number, carrier)
2. Introduction paragraph explaining the purpose of the supplement
3. Detailed line items table with:
   - Item description
   - Quantity/Unit
   - Estimated cost
   - Reason/rationale (code requirement, damage, etc.)
4. Summary paragraph for the adjuster
5. Professional closing

Return the document in HTML format suitable for conversion to PDF.

Job Information:
${JSON.stringify({
  homeowner_name: job.homeowner_name || "Homeowner",
  address: job.address || "Property Address",
  claim_number: job.claim_number || "N/A",
  carrier: job.carrier || "Insurance Carrier",
  title: job.title || job.homeowner_name || "Roofing Job",
}, null, 2)}

Supplement Items:
${JSON.stringify(items.map(item => ({
  line_item: item.line_item,
  reason: item.reason,
  estimated_cost: item.estimated_cost,
})), null, 2)}

Total Estimated Supplement Amount: $${totalEstimated.toFixed(2)}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const html = completion.choices[0].message.content;
    if (!html) {
      throw new Error("No response from OpenAI");
    }

    // Save HTML as document in job_documents table (if it exists) or create a simple storage
    // For now, we'll return the HTML and let the frontend handle storage/PDF conversion
    // In a future version, we can use browserless or similar to convert to PDF server-side

    return new Response(
      JSON.stringify({
        html,
        job_id,
        total_estimated: totalEstimated,
        item_count: items.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in generate_supplement_packet:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
