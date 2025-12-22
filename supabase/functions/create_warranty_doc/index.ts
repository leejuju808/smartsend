// Block 28000 — SmartSend Roofing Warranty & Service Call Engine v1
// Edge Function: Generate Warranty Certificate Document
// Creates a professional HTML warranty certificate for completed jobs

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

    // Load job information
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, workspace_id, lead_id, scheduled_end_date, job_value")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load warranty information
    const { data: warranty, error: warrantyError } = await supabase
      .from("roofing_warranties")
      .select("*")
      .eq("job_id", job_id)
      .single();

    if (warrantyError || !warranty) {
      return new Response(
        JSON.stringify({ error: "Warranty not found for this job" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load customer information from lead
    let customerName = "Valued Customer";
    let address = "";
    if (job.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("first_name, last_name, address, city, state, zip")
        .eq("id", job.lead_id)
        .single();

      if (lead) {
        if (lead.first_name || lead.last_name) {
          customerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
        }
        const addressParts = [
          lead.address,
          lead.city,
          lead.state,
          lead.zip,
        ].filter(Boolean);
        address = addressParts.join(", ");
      }
    }

    // Load workspace/company information
    let companyName = "Your Roofing Company";
    if (job.workspace_id) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", job.workspace_id)
        .single();

      if (workspace?.name) {
        companyName = workspace.name;
      }
    }

    // Format dates
    const completionDate = job.scheduled_end_date
      ? new Date(job.scheduled_end_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    const warrantyStartDate = warranty.start_date
      ? new Date(warranty.start_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : completionDate;

    const warrantyEndDate = warranty.end_date
      ? new Date(warranty.end_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A";

    // Generate warranty certificate HTML using OpenAI
    const prompt = `Create a clean, professional HTML warranty certificate for a roofing job.

Include:
- Customer name: ${customerName}
- Address: ${address}
- Job title: ${job.title || "Roofing Installation"}
- Completion date: ${completionDate}
- Warranty start date: ${warrantyStartDate}
- Warranty end date: ${warrantyEndDate}
- Labor warranty: ${warranty.labor_years} years
- Material warranty: ${warranty.material_years} years
- Company name: ${companyName}

The certificate should be:
- Professional and trustworthy looking
- Include a clear header with "WARRANTY CERTIFICATE"
- List all warranty terms clearly
- Include standard warranty language about what is covered
- Have a clean, modern design with proper spacing
- Be print-ready (suitable for PDF generation)
- Include a footer with company information

Return ONLY the HTML content, no markdown formatting, no code blocks.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const html = completion.choices[0].message.content;

    if (!html) {
      return new Response(
        JSON.stringify({ error: "Failed to generate warranty certificate" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Clean up HTML (remove markdown code blocks if present)
    let cleanHtml = html.trim();
    if (cleanHtml.startsWith("```html")) {
      cleanHtml = cleanHtml.replace(/^```html\n?/, "").replace(/\n?```$/, "");
    } else if (cleanHtml.startsWith("```")) {
      cleanHtml = cleanHtml.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    // Save into job_documents for viewing and sharing
    const { data: document, error: docError } = await supabase
      .from("job_documents")
      .insert({
        job_id: job.id,
        workspace_id: job.workspace_id,
        title: `Warranty Certificate - ${completionDate}`,
        doc_type: "other", // Could be updated to 'warranty' when that type is added
        html_content: cleanHtml,
        metadata: {
          warranty_id: warranty.id,
          warranty_type: warranty.warranty_type,
          labor_years: warranty.labor_years,
          material_years: warranty.material_years,
          generated_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (docError) {
      console.error("Error saving warranty document:", docError);
      // Still return the HTML even if saving fails
    }

    return new Response(
      JSON.stringify({
        html: cleanHtml,
        document_id: document?.id,
        warranty_id: warranty.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error generating warranty certificate:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































