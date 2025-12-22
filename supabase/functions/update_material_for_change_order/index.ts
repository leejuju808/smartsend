// Block 27760 — SmartSend Roofing Material Order Automation v1
// Edge Function: Apply Change Orders to Material Orders

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
    const { change_order_id } = await req.json();

    if (!change_order_id) {
      return new Response(
        JSON.stringify({ error: "change_order_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Load CO + items + job
    const { data: co, error: coError } = await supabase
      .from("roofing_change_orders")
      .select("id, job_id, reason_category")
      .eq("id", change_order_id)
      .single();

    if (coError || !co) {
      return new Response(
        JSON.stringify({ error: "Change order not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("roofing_change_order_items")
      .select("*")
      .eq("change_order_id", change_order_id);

    if (itemsError) {
      return new Response(
        JSON.stringify({ error: "Failed to load change order items" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, homeowner_name, estimated_squares, official_squares, roof_squares")
      .eq("id", co.job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Figure out material changes from CO description
    const prompt = `
You are a roofing materials estimator.

Given this change order with items:
${JSON.stringify(items || [])}

Return JSON:
{
  "materials": [
    {
      "category": "Shingles",
      "description": "Extra shingles for additional slope",
      "quantity": 6,
      "unit": "bundle"
    }
  ]
}

Return ONLY valid JSON with a "materials" array.
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
      parsed = { materials: [] };
    }

    const extra = parsed.materials || [];

    // 3. Get existing draft/active material order for job
    const { data: order } = await supabase
      .from("roofing_material_orders")
      .select("*")
      .eq("job_id", job.id)
      .in("status", ["draft", "sent", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!order) {
      // Option: create a new small order for extras
      const { data: newOrder, error: newOrderError } = await supabase
        .from("roofing_material_orders")
        .insert({
          job_id: job.id,
          status: "draft",
          notes: `Change order extras for CO ${change_order_id}`
        })
        .select("*")
        .single();

      if (newOrderError || !newOrder) {
        return new Response(
          JSON.stringify({ error: "Failed to create new order" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Insert extras
      const insertExtras = extra.map((m: any) => ({
        order_id: newOrder.id,
        category: m.category || "Other",
        description: m.description,
        quantity: m.quantity || 0,
        unit: m.unit || "ea",
        source: "change_order",
        source_ref: change_order_id
      }));

      if (insertExtras.length > 0) {
        const { error: insertError } = await supabase
          .from("roofing_material_order_items")
          .insert(insertExtras);

        if (insertError) {
          console.error("Failed to insert extras:", insertError);
        }
      }

      return new Response(
        JSON.stringify({ order_id: newOrder.id, extras: insertExtras }),
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      // Append extras to existing order
      const insertExtras = extra.map((m: any) => ({
        order_id: order.id,
        category: m.category || "Other",
        description: m.description,
        quantity: m.quantity || 0,
        unit: m.unit || "ea",
        source: "change_order",
        source_ref: change_order_id
      }));

      if (insertExtras.length > 0) {
        const { error: insertError } = await supabase
          .from("roofing_material_order_items")
          .insert(insertExtras);

        if (insertError) {
          console.error("Failed to insert extras:", insertError);
        }
      }

      return new Response(
        JSON.stringify({ order_id: order.id, extras: insertExtras }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Error in update_material_for_change_order:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































