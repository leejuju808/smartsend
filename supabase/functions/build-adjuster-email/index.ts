// Block 27080 — SmartSend Roofing Adjuster Communication Playbooks v1
// Edge Function: /build-adjuster-email
// 
// Generates professional adjuster emails using AI + template system
// Combines job details, supplement data, and playbook templates

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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { job_id, playbook_id, adjuster_name } = await req.json();

    if (!job_id || !playbook_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: job_id, playbook_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Load playbook template
    const { data: template, error: templateError } = await supabase
      .from("roofing_adjuster_playbooks")
      .select("*")
      .eq("id", playbook_id)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: "Playbook template not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Load job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, homeowner_name, address, claim_number, carrier")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Load supplement details (if exists)
    const { data: supplement } = await supabase
      .from("roofing_supplements")
      .select("id, summary, adjuster_notes")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Load supplement line items
    let items: any[] = [];
    if (supplement) {
      const { data: lineItems } = await supabase
        .from("roofing_supplement_line_items")
        .select("description, quantity, unit, rationale, code")
        .eq("supplement_id", supplement.id);

      items = lineItems || [];
    }

    // 5. Load insurance claim details (if exists)
    const { data: insuranceClaim } = await supabase
      .from("job_insurance_claims")
      .select("adjuster_name, adjuster_email, adjuster_phone, claim_number")
      .eq("job_id", job_id)
      .maybeSingle();

    // 6. Build context for AI
    const jobInfo = {
      homeowner_name: job.homeowner_name || "Homeowner",
      property_address: job.address || "Property",
      claim_number: job.claim_number || insuranceClaim?.claim_number || "N/A",
      carrier: job.carrier || "Insurance Carrier",
      adjuster_name: adjuster_name || insuranceClaim?.adjuster_name || "Adjuster",
    };

    const supplementSummary = supplement?.summary || "";
    const supplementItems = items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      rationale: item.rationale,
      code: item.code,
    }));

    // 7. Build AI prompt
    const prompt = `You are creating a professional email to an insurance adjuster for a roofing claim.
The tone should be "${template.tone}" (friendly = warm and collaborative, firm = respectful but clear, assertive = evidence-based pushback, escalation = formal supervisor request).

Job Information:
- Homeowner: ${jobInfo.homeowner_name}
- Property Address: ${jobInfo.property_address}
- Claim Number: ${jobInfo.claim_number}
- Carrier: ${jobInfo.carrier}
- Adjuster Name: ${jobInfo.adjuster_name}

${supplementSummary ? `Supplement Summary:\n${supplementSummary}\n\n` : ""}
${supplementItems.length > 0 ? `Supplement Line Items:\n${JSON.stringify(supplementItems, null, 2)}\n\n` : ""}

Template to fill:
Subject: ${template.subject_template}
Body:
${template.body_template}

Instructions:
1. Replace all placeholders like {{adjuster_name}}, {{claim_number}}, {{property_address}}, {{supplement_items}}, {{supplement_rationale}}, {{code_references}}, {{company_name}}
2. If supplement_items exist, format them as a bulleted list in the email
3. If supplement_rationale exists, include it naturally in the email
4. Extract code references from line items if they exist
5. Use "SmartSend" as the company_name if not specified
6. Keep the tone exactly as specified: ${template.tone}
7. Make the email professional, clear, and legally safe
8. Ensure all placeholders are replaced with actual values

Return ONLY a JSON object with this structure:
{
  "subject": "filled subject line",
  "body": "filled email body with proper formatting"
}`;

    // 8. Call OpenAI
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent, professional output
        max_tokens: 1500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiContent = openaiData.choices?.[0]?.message?.content || "";

    // 9. Parse AI response
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in AI response");
      }
    } catch (parseError) {
      // Fallback: if AI doesn't return JSON, create a simple structure
      const lines = aiContent.split("\n");
      const subjectLine = lines.find((line) => line.toLowerCase().includes("subject")) || template.subject_template;
      const bodyStart = lines.findIndex((line) => line.toLowerCase().includes("body"));
      const body = bodyStart >= 0 ? lines.slice(bodyStart + 1).join("\n") : aiContent;

      result = {
        subject: subjectLine.replace(/^subject:?\s*/i, "").trim(),
        body: body.trim(),
      };
    }

    // 10. Replace any remaining placeholders manually as fallback
    let finalSubject = result.subject || template.subject_template;
    let finalBody = result.body || template.body_template;

    // Replace common placeholders
    finalSubject = finalSubject
      .replace(/\{\{claim_number\}\}/g, jobInfo.claim_number)
      .replace(/\{\{property_address\}\}/g, jobInfo.property_address)
      .replace(/\{\{adjuster_name\}\}/g, jobInfo.adjuster_name);

    finalBody = finalBody
      .replace(/\{\{adjuster_name\}\}/g, jobInfo.adjuster_name)
      .replace(/\{\{claim_number\}\}/g, jobInfo.claim_number)
      .replace(/\{\{property_address\}\}/g, jobInfo.property_address)
      .replace(/\{\{company_name\}\}/g, "SmartSend");

    // Format supplement items if they exist
    if (supplementItems.length > 0 && finalBody.includes("{{supplement_items}}")) {
      const itemsList = supplementItems
        .map((item) => {
          const qty = item.quantity ? `${item.quantity} ` : "";
          const unit = item.unit ? `${item.unit} ` : "";
          const code = item.code ? ` (Code: ${item.code})` : "";
          return `- ${qty}${unit}${item.description}${code}`;
        })
        .join("\n");
      finalBody = finalBody.replace(/\{\{supplement_items\}\}/g, itemsList);
    }

    // Format supplement rationale if it exists
    if (supplementSummary && finalBody.includes("{{supplement_rationale}}")) {
      finalBody = finalBody.replace(/\{\{supplement_rationale\}\}/g, supplementSummary);
    }

    // Format code references if they exist
    const codeRefs = supplementItems
      .filter((item) => item.code)
      .map((item) => item.code)
      .join(", ");
    if (codeRefs && finalBody.includes("{{code_references}}")) {
      finalBody = finalBody.replace(/\{\{code_references\}\}/g, codeRefs);
    }

    return new Response(
      JSON.stringify({
        subject: finalSubject,
        body: finalBody,
        playbook_name: template.playbook_name,
        tone: template.tone,
        adjuster_email: insuranceClaim?.adjuster_email || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in build-adjuster-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});



































