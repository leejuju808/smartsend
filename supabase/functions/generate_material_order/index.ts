// Block 27760 — SmartSend Roofing Material Order Automation v1
// Edge Function: Generate Material Order from Job Data

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
    const { job_id, supplier_id, waste_factor } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Load job basics
    // Note: Different migrations may have different field names
    // Try to get squares from estimated_squares, official_squares, or roof_squares
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, homeowner_name, estimated_squares, official_squares, roof_squares, roof_pitch, address")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const effectiveWaste = waste_factor ?? 0.1; // 10% waste by default
    // Try different square fields
    const squares = Number(
      job.estimated_squares || 
      job.official_squares || 
      job.roof_squares || 
      0
    );
    const totalSquaresWithWaste = squares * (1 + effectiveWaste);
    
    // Get job name for notes
    const jobName = job.title || job.homeowner_name || `Job ${job_id}`;

    // 2. Ask AI for a structured material breakdown
    const prompt = `
You are a roofing materials estimator.

Given:
- Squares: ${squares}
- Roof material: architectural shingles (default)
- Waste factor: ${effectiveWaste}
- Pitch: ${job.roof_pitch || "unknown"}

Create a JSON array named "items" with material items for a standard roof order, with fields:

[
  {
    "category": "Shingles",
    "product_code": "",
    "description": "Architectural shingles - main field",
    "quantity": 72,
    "unit": "bundle"
  }
]

Include:
- Shingles (bundles) with waste factored in
- Ridge caps
- Starter
- Underlayment
- Ice & water (if steep or cold climate assumption)
- Drip edge
- Vents
- Nails and other basics

Return ONLY valid JSON with an "items" array.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    });

    let parsed;
    try {
      const content = completion.choices[0].message.content || "{}";
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{.*\})\s*```/s) || content.match(/(\{.*\})/s);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      parsed = { items: [] };
    }

    const items = parsed.items || [];

    // 3. Create material order header
    const { data: order, error: orderError } = await supabase
      .from("roofing_material_orders")
      .insert({
        job_id,
        supplier_id: supplier_id || null,
        status: "draft",
        notes: `Auto-generated from job ${jobName}`
      })
      .select("*")
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: orderError?.message || "Failed to create order" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Insert items
    const insertItems = items.map((i: any) => ({
      order_id: order.id,
      category: i.category || "Other",
      product_code: i.product_code || null,
      description: i.description,
      quantity: i.quantity || 0,
      unit: i.unit || "ea",
      source: "base_scope"
    }));

    if (insertItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("roofing_material_order_items")
        .insert(insertItems);

      if (itemsError) {
        console.error("Failed to insert items:", itemsError);
      }
    }

    // 5. Set job material_status
    await supabase
      .from("roofing_jobs")
      .update({ material_status: "draft_order" })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({
        order_id: order.id,
        items: insertItems
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in generate_material_order:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































