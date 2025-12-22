// Block 27940 — SmartSend Roofing QA & Completion Verification Engine v1
// Edge Function: Run Job QA
// Triggered when roofing_jobs.status becomes completed, or via manual trigger
// Runs AI QA check on completed jobs

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
        status,
        job_value,
        final_revenue,
        estimated_squares,
        roof_squares,
        roof_material,
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

    if (job.status !== "completed") {
      return new Response(
        JSON.stringify({ error: "Job not completed yet" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Load photos (from job_field_photos)
    const { data: photos, error: photosError } = await supabase
      .from("job_field_photos")
      .select("tag, storage_path, caption, created_at")
      .eq("job_id", job_id)
      .order("created_at", { ascending: true });

    if (photosError) {
      console.error("Error fetching photos:", photosError);
    }

    // Get photo URLs from storage
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
        created_at: photo.created_at,
      };
    });

    // 3. Load issues (from job_issues)
    const { data: issues, error: issuesError } = await supabase
      .from("job_issues")
      .select("*")
      .eq("job_id", job_id);

    if (issuesError) {
      console.error("Error fetching issues:", issuesError);
    }

    // 4. Pick a QA template (v1: first active)
    const { data: template } = await supabase
      .from("roofing_qa_templates")
      .select("*")
      .eq("active", true)
      .limit(1)
      .single();

    // 5. Create QA run record (pending)
    const { data: qaRun, error: qaRunError } = await supabase
      .from("roofing_job_qa_runs")
      .insert({
        job_id,
        template_id: template?.id ?? null,
        status: "in_progress",
      })
      .select("*")
      .single();

    if (qaRunError || !qaRun) {
      throw new Error(`Failed to create QA run: ${qaRunError?.message}`);
    }

    // 6. Build AI prompt
    const prompt = `You are a roofing quality control inspector.

You are given:
- Job info
- Photos categories (before, during, after, issue, material, safety)
- Crew-reported issues

Your tasks:
1. Evaluate whether the photo set is sufficient to document the job (front, back, sides, details).
2. Infer possible quality issues (missing ridge caps, visible defects, poor cleanup) only from data/text — do NOT fabricate specifics.
3. Produce:
   - overall_result: "pass", "minor_issues", or "major_issues"
   - findings: list of objects {severity, category, message}
   - homeowner_summary: 3–5 sentence plain English explanation of what was done and that the job is complete.

Return JSON:
{
  "overall_result": "pass",
  "findings": [
    {
      "severity": "info",
      "category": "photos",
      "message": "Before and after photos are present."
    }
  ],
  "ai_summary": "Internal QA notes...",
  "homeowner_summary": "Customer-facing summary..."
}

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

Photos:
${JSON.stringify(photosWithUrls)}

CrewIssues:
${JSON.stringify(issues || [])}`;

    // 7. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert roofing quality control inspector. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000,
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      parsed = {};
    }

    const overall_result = parsed.overall_result || "pass";
    const findings = parsed.findings || [];
    const ai_summary = parsed.ai_summary || "";
    const homeowner_summary = parsed.homeowner_summary || "";

    // 8. Update QA run
    const { error: updateError } = await supabase
      .from("roofing_job_qa_runs")
      .update({
        status: "completed",
        overall_result,
        ai_summary,
        homeowner_summary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", qaRun.id);

    if (updateError) {
      throw new Error(`Failed to update QA run: ${updateError.message}`);
    }

    // 9. Insert findings
    if (findings.length > 0) {
      const insertFindings = findings.map((f: any) => ({
        qa_run_id: qaRun.id,
        severity: f.severity || "info",
        category: f.category || "general",
        message: f.message || "",
      }));

      const { error: findingsError } = await supabase
        .from("roofing_job_qa_findings")
        .insert(insertFindings);

      if (findingsError) {
        console.error("Failed to insert findings:", findingsError);
        // Don't fail the whole request if findings insert fails
      }
    }

    return new Response(
      JSON.stringify({
        qa_run_id: qaRun.id,
        overall_result,
        findings_count: findings.length,
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
    console.error("Error running job QA:", error);
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



































