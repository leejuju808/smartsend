// Block 27140 — SmartSend Roofing Estimate & Proposal Generator v1
// Edge Function: Build Estimate & Proposal from Job Data + AI Insights

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req: Request) => {
  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Load job + lead context
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        homeowner_name,
        address,
        estimated_squares,
        projected_job_value,
        lead_id
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get AI insights if lead_id exists
    let insights = null;
    if (job.lead_id) {
      const { data: aiInsights } = await supabase
        .from("roofing_lead_ai_insights")
        .select("*")
        .eq("lead_id", job.lead_id)
        .single();
      insights = aiInsights;
    }

    // 2. Build AI prompt
    const prompt = `You are a sales proposal assistant for a roofing contractor.

Your job:
1. Create a clear estimate structure for a roof replacement.
2. Create 3 proposal tiers: Good / Better / Best.
3. Use a friendly, non-technical tone suitable for a homeowner.

Job info:
- Customer: ${job.homeowner_name || "Homeowner"}
- Address: ${job.address || "Address not provided"}
- Estimated squares: ${job.estimated_squares || 0}
- Base estimated value: $${job.projected_job_value || 0}

Lead insights:
${insights ? JSON.stringify({
  summary: insights.summary,
  buying_intent: insights.buying_intent,
  objections: insights.objections,
  recommended_angle: insights.recommended_angle,
  next_action: insights.next_action
}) : "No AI insights available"}

You must return a valid JSON object with this exact structure:
{
  "estimate": {
    "summary": "Short description of the project",
    "line_items": [
      {
        "category": "Roof System",
        "description": "Tear-off and disposal of existing shingles",
        "quantity": 20,
        "unit": "sq",
        "unit_price": 120,
        "total_price": 2400
      },
      {
        "category": "Roof System",
        "description": "Installation of new architectural shingles",
        "quantity": 20,
        "unit": "sq",
        "unit_price": 350,
        "total_price": 7000
      },
      {
        "category": "Accessories",
        "description": "Ridge vent installation",
        "quantity": 150,
        "unit": "lf",
        "unit_price": 8,
        "total_price": 1200
      },
      {
        "category": "Labor",
        "description": "Professional installation and cleanup",
        "quantity": 1,
        "unit": "ea",
        "unit_price": null,
        "total_price": 3500
      }
    ]
  },
  "proposals": [
    {
      "tier": "good",
      "title": "Good – Solid Architectural Shingle System",
      "subtitle": "Balanced option for long-term protection",
      "price": 14500,
      "features": [
        "Architectural shingles (30-year warranty)",
        "Standard synthetic underlayment",
        "Basic ridge vent ventilation",
        "Complete tear-off and disposal",
        "Professional installation and cleanup"
      ],
      "warranty_text": "10-year workmanship warranty. Manufacturer warranty on materials.",
      "notes": "Best balance of cost and protection. Perfect for homeowners looking for quality without premium pricing."
    },
    {
      "tier": "better",
      "title": "Better – Premium Shingle System with Enhanced Protection",
      "subtitle": "Upgraded materials and extended warranty",
      "price": 18500,
      "features": [
        "Premium architectural shingles (50-year warranty)",
        "Ice and water shield in valleys and eaves",
        "High-performance ridge vent system",
        "Complete tear-off and disposal",
        "Professional installation and cleanup",
        "Gutter protection included"
      ],
      "warranty_text": "15-year workmanship warranty. 50-year manufacturer warranty on materials.",
      "notes": "Ideal for homeowners who want extra protection and peace of mind. Includes enhanced weather protection."
    },
    {
      "tier": "best",
      "title": "Best – Ultimate Protection & Premium Materials",
      "subtitle": "Top-tier system with maximum durability",
      "price": 22500,
      "features": [
        "Luxury architectural shingles (lifetime warranty)",
        "Full ice and water shield coverage",
        "Premium ventilation system",
        "Complete tear-off and disposal",
        "Professional installation and cleanup",
        "Gutter protection and leaf guards",
        "Solar-reflective shingles (energy savings)",
        "Extended warranty coverage"
      ],
      "warranty_text": "20-year workmanship warranty. Lifetime manufacturer warranty on materials.",
      "notes": "The ultimate roofing solution. Maximum protection, energy efficiency, and long-term value. Best for homeowners who want the absolute best."
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response");
      }
    }

    // 3. Upsert estimate
    const { data: existing } = await supabase
      .from("roofing_estimates")
      .select("id, version")
      .eq("job_id", job_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    let estimateId: string;
    let version = 1;

    if (!existing) {
      const { data: created, error: createError } = await supabase
        .from("roofing_estimates")
        .insert({
          job_id,
          summary: parsed.estimate?.summary || "Roof replacement estimate",
          total_price: parsed.estimate?.line_items?.reduce((sum: number, item: any) => sum + (item.total_price || 0), 0) || 0,
        })
        .select("id, version")
        .single();

      if (createError || !created) {
        throw new Error(`Failed to create estimate: ${createError?.message}`);
      }

      estimateId = created.id;
      version = created.version;
    } else {
      estimateId = existing.id;
      version = existing.version + 1;
      
      const { error: updateError } = await supabase
        .from("roofing_estimates")
        .update({
          summary: parsed.estimate?.summary || "Roof replacement estimate",
          total_price: parsed.estimate?.line_items?.reduce((sum: number, item: any) => sum + (item.total_price || 0), 0) || 0,
          version,
        })
        .eq("id", estimateId);

      if (updateError) {
        throw new Error(`Failed to update estimate: ${updateError.message}`);
      }

      // Delete existing line items
      await supabase
        .from("roofing_estimate_line_items")
        .delete()
        .eq("estimate_id", estimateId);
    }

    // 4. Insert estimate line items
    const items = (parsed.estimate?.line_items || []).map((li: any, index: number) => ({
      estimate_id: estimateId,
      category: li.category || "Roof System",
      description: li.description,
      quantity: li.quantity || 1,
      unit: li.unit || "ea",
      unit_price: li.unit_price || null,
      total_price: li.total_price || null,
      sort_order: index,
    }));

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from("roofing_estimate_line_items")
        .insert(items);

      if (itemsError) {
        throw new Error(`Failed to insert line items: ${itemsError.message}`);
      }
    }

    // 5. Delete existing proposals and insert new ones
    await supabase
      .from("roofing_proposals")
      .delete()
      .eq("job_id", job_id);

    const proposals = (parsed.proposals || []).map((p: any) => ({
      job_id,
      tier: p.tier,
      title: p.title,
      subtitle: p.subtitle,
      price: p.price,
      features: p.features || [],
      warranty_text: p.warranty_text || null,
      notes: p.notes || null,
    }));

    if (proposals.length > 0) {
      const { error: proposalsError } = await supabase
        .from("roofing_proposals")
        .insert(proposals);

      if (proposalsError) {
        throw new Error(`Failed to insert proposals: ${proposalsError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        estimate_id: estimateId,
        version,
        items_count: items.length,
        proposals_count: proposals.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in build_estimate_and_proposal:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































