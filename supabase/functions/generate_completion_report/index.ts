// Block 27940 — SmartSend Roofing QA & Completion Verification Engine v1
// Edge Function: Generate Completion Report
// Generates HTML completion report for homeowner and insurance

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

    // 1. Load job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        homeowner_name,
        address,
        roof_material,
        estimated_squares,
        roof_squares,
        final_revenue,
        job_value,
        completed_at
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Load QA run
    const { data: qaRun } = await supabase
      .from("roofing_job_qa_runs")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // 3. Load photos
    const { data: photos } = await supabase
      .from("job_field_photos")
      .select("tag, storage_path, caption")
      .eq("job_id", job_id)
      .order("created_at", { ascending: true });

    // Get photo URLs
    const photosWithUrls = (photos || []).map((photo) => {
      // Get public URL using Supabase storage client
      let photoUrl = null;
      if (photo.storage_path) {
        const { data: urlData } = supabase.storage
          .from("field-photos")
          .getPublicUrl(photo.storage_path);
        photoUrl = urlData.publicUrl;
      }
      
      return {
        category: photo.tag || "unknown",
        url: photoUrl,
        caption: photo.caption,
      };
    });

    // 4. Build AI prompt
    const prompt = `Create an HTML job completion report for a roofing project.

Audience: homeowner and possibly their insurance company.

Sections:
1. Job summary (address, homeowner, completion date, roof type, squares)
2. Work performed (short bullet list)
3. Before & After photo references (just show <img> tags with URLs)
4. Notes on ventilation, flashing, cleanup (based on QA summary)
5. Warranty start date (use job.completed_at)
6. Signature line (company + homeowner)

Keep it professional, clean, and easy to read. Use modern HTML with inline CSS for styling.

Job:
${JSON.stringify({
  title: job.title,
  homeowner_name: job.homeowner_name,
  address: job.address,
  roof_material: job.roof_material,
  estimated_squares: job.estimated_squares || job.roof_squares,
  final_revenue: job.final_revenue || job.job_value,
  completed_at: job.completed_at,
})}

QA:
${JSON.stringify(qaRun || {})}

Photos:
${JSON.stringify(photosWithUrls)}

Return ONLY the HTML content, no markdown, no code blocks, just the HTML.`;

    // 5. Generate HTML with AI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional document generator. Generate clean, professional HTML for roofing completion reports. Return only HTML, no markdown or code blocks.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    let html = completion.choices[0]?.message?.content || "";

    // Clean up HTML (remove markdown code blocks if present)
    html = html.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();

    // 6. Save to job_documents
    const { error: docError } = await supabase
      .from("job_documents")
      .insert({
        job_id,
        title: "Completion Report",
        doc_type: "warranty_completion_certificate",
        html_content: html,
        file_url: "", // HTML is stored in html_content
        uploaded_at: new Date().toISOString(),
      });

    if (docError) {
      console.error("Failed to save completion report:", docError);
      // Don't fail the request, just log it
    }

    return new Response(
      JSON.stringify({
        success: true,
        html,
        job_id,
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
    console.error("Error generating completion report:", error);
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



































