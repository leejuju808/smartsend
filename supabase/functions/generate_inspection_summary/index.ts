// Block 26940 — SmartSend Roofing Field Photo & Document Intelligence v1
// Edge Function: Generate Inspection Summary
// Triggered when 10+ photos exist for a job, or manually
// Generates AI-powered inspection summary, supplement line items, and insurance notes

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Fetch labeled photos
    const { data: photos, error: photosError } = await supabase
      .from("roofing_field_photos")
      .select("category, damage_labels, ai_summary, storage_path")
      .eq("job_id", job_id)
      .order("created_at", { ascending: true });

    if (photosError) {
      throw new Error(`Failed to fetch photos: ${photosError.message}`);
    }

    if (!photos || photos.length === 0) {
      return new Response(
        JSON.stringify({ error: "No photos found for this job" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get job details for context
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, homeowner_name, address, carrier, claim_number")
      .eq("id", job_id)
      .single();

    if (jobError) {
      console.error("Error fetching job:", jobError);
    }

    // Organize photos by category
    const photosByCategory: Record<string, any[]> = {};
    const allDamageLabels = new Set<string>();

    photos.forEach((photo) => {
      const category = photo.category || "uncategorized";
      if (!photosByCategory[category]) {
        photosByCategory[category] = [];
      }
      photosByCategory[category].push(photo);

      // Collect all damage labels
      if (photo.damage_labels && Array.isArray(photo.damage_labels)) {
        photo.damage_labels.forEach((label: string) => {
          allDamageLabels.add(label);
        });
      }
    });

    // Build prompt for AI
    const prompt = `You are an expert roofing inspector generating a professional inspection summary for an insurance supplement.

Job Details:
${job ? `- Homeowner: ${job.homeowner_name || "N/A"}\n- Address: ${job.address || "N/A"}\n- Insurance Carrier: ${job.carrier || "N/A"}\n- Claim Number: ${job.claim_number || "N/A"}` : ""}

Photo Analysis Summary:
Total Photos: ${photos.length}

Photos by Category:
${Object.entries(photosByCategory)
  .map(
    ([category, categoryPhotos]) =>
      `- ${category}: ${categoryPhotos.length} photo(s)`
  )
  .join("\n")}

Detected Damage Types:
${Array.from(allDamageLabels).length > 0
  ? Array.from(allDamageLabels).map((label) => `- ${label}`).join("\n")
  : "- None detected"}

Photo Details:
${photos
  .map(
    (photo, idx) =>
      `Photo ${idx + 1} (${photo.category || "uncategorized"}): ${photo.ai_summary || "No summary"} | Damage: ${photo.damage_labels?.join(", ") || "None"}`
  )
  .join("\n")}

Generate a professional roofing inspection summary with the following structure:

1. SUMMARY (3-6 bullet points covering major findings):
   - Focus on damage severity, locations, and impact
   - Be specific about quantities (e.g., "12 hail hits per square on north slope")
   - Mention code violations or improper installations if found

2. LINE ITEMS (array of suggested supplement line items):
   - Use standard roofing terminology
   - Examples: "Ridge cap replacement", "Drip edge installation", "Underlayment replacement", "Shingle replacement - north slope", "Vent boot replacement"
   - Only include items that are justified by the photo evidence

3. INSURANCE NOTES (paragraph explaining insurance justification):
   - Explain why the damage qualifies for insurance coverage
   - Reference specific damage types (hail, wind, etc.)
   - Mention code compliance issues if applicable
   - Be professional and factual

Respond ONLY with valid JSON in this exact format:
{
  "summary": "• [bullet point 1]\n• [bullet point 2]\n• [bullet point 3]\n...",
  "line_items": ["line item 1", "line item 2", "line item 3", ...],
  "insurance_notes": "Professional paragraph explaining insurance justification..."
}`;

    // Generate AI summary
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert roofing inspector generating professional inspection summaries for insurance supplements. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1500,
    });

    const output = JSON.parse(
      response.choices[0]?.message?.content || "{}"
    );

    // Validate output structure
    if (!output.summary || !output.line_items || !output.insurance_notes) {
      throw new Error("Invalid AI response structure");
    }

    // Save to job table
    const { error: updateError } = await supabase
      .from("roofing_jobs")
      .update({
        inspection_summary: output.summary,
        supplement_line_items: output.line_items,
        insurance_notes: output.insurance_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    if (updateError) {
      throw new Error(`Failed to update job: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        summary: output.summary,
        line_items: output.line_items,
        insurance_notes: output.insurance_notes,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error generating inspection summary:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});



































