// Block 27700 — SmartSend Roofing Change Order Engine v1
// Edge Function: Generate Change Order Document

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

    // Load change order, job info, items
    const { data: co, error: coError } = await supabase
      .from("roofing_change_orders")
      .select("*, job_id, workspace_id")
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
      .eq("change_order_id", change_order_id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return new Response(
        JSON.stringify({ error: "Failed to load change order items" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", co.job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate total
    const total = items.reduce(
      (sum: number, item: any) => sum + (item.line_total || item.quantity * item.unit_cost),
      0
    );

    // Format date
    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Build prompt for AI
    const prompt = `Create a professional roofing Change Order document in HTML format.

Include:
- Company header placeholder (use placeholder text like "[Company Name]" and "[Company Address]")
- Job name/address: ${job.title || job.homeowner_name || "Job"} - ${job.address || "Address"}
- Homeowner name: ${job.homeowner_name || "Homeowner"}
- Reason category: ${co.reason_category || "Change Order"}
- Table of line items with columns: Description, Quantity, Unit Cost, Total
- Subtotal and total amount
- Customer signature block with date field
- Today's date: ${today}
- Terms: "Work will not proceed until this Change Order is approved and signed."
- Professional styling with clean layout

Line Items:
${items.map((item: any, idx: number) => 
  `${idx + 1}. ${item.description} - Qty: ${item.quantity} @ $${item.unit_cost.toFixed(2)} = $${(item.quantity * item.unit_cost).toFixed(2)}`
).join("\n")}

Total: $${total.toFixed(2)}

Return ONLY the HTML content, no markdown formatting, no code blocks. Make it print-ready and professional.`;

    // Generate HTML document using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional document generator for roofing contractors. Generate clean, professional HTML documents that are print-ready.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const html = completion.choices[0].message.content;

    if (!html) {
      return new Response(
        JSON.stringify({ error: "Failed to generate document" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Save into job_documents for viewing and signing
    const { data: document, error: docError } = await supabase
      .from("job_documents")
      .insert({
        job_id: job.id,
        workspace_id: co.workspace_id,
        title: `Change Order - ${today}`,
        doc_type: "other", // Will be updated to 'change_order' when that type is added
        html_content: html,
        metadata: {
          change_order_id: change_order_id,
          total_amount: total,
          reason_category: co.reason_category,
          items_count: items.length,
        },
      })
      .select()
      .single();

    if (docError) {
      console.error("Error saving document:", docError);
      // Still return the HTML even if saving fails
    }

    return new Response(
      JSON.stringify({
        html,
        document_id: document?.id,
        total,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error generating change order:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































