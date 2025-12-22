// Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
// Edge Function: /storm/complete-inspection
// 
// Tech uploads photos → SmartSend AI generates findings, damage classification, repair vs replacement recommendation
// Then generates PDF report

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      request_id,
      findings,
      damage_classification,
      severity_score,
      recommendation,
      recommendation_details,
      estimated_repair_cost,
      estimated_replacement_cost,
      photos,
      inspection_date,
    } = await req.json();

    if (!request_id) {
      return new Response(
        JSON.stringify({ error: "request_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get inspection request
    const { data: request, error: requestError } = await supabase
      .from("storm_inspection_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (requestError || !request) {
      return new Response(
        JSON.stringify({ error: "Inspection request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If AI analysis not provided, generate it from photos
    let aiFindings = findings;
    let aiClassification = damage_classification;
    let aiRecommendation = recommendation;
    let aiSeverityScore = severity_score;

    if (photos && photos.length > 0 && !findings) {
      // Call AI to analyze photos
      const aiAnalysis = await analyzeStormDamagePhotos(photos);
      aiFindings = aiAnalysis.findings;
      aiClassification = aiAnalysis.damage_classification;
      aiRecommendation = aiAnalysis.recommendation;
      aiSeverityScore = aiAnalysis.severity_score;
    }

    // Create inspection report
    const { data: report, error: reportError } = await supabase
      .from("storm_inspection_reports")
      .insert({
        request_id,
        workspace_id: request.workspace_id,
        findings: aiFindings || {},
        damage_classification: aiClassification,
        severity_score: aiSeverityScore,
        recommendation: aiRecommendation,
        recommendation_details,
        estimated_repair_cost,
        estimated_replacement_cost,
        photos: photos || [],
        inspection_date: inspection_date || new Date().toISOString().split("T")[0],
        inspected_by: request.technician_id,
      })
      .select()
      .single();

    if (reportError) {
      throw reportError;
    }

    // Generate PDF report
    const pdfUrl = await generateInspectionPDF(report, request);

    // Update report with PDF URL
    if (pdfUrl) {
      await supabase
        .from("storm_inspection_reports")
        .update({ pdf_url: pdfUrl })
        .eq("id", report.id);
    }

    // Update request status
    await supabase
      .from("storm_inspection_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return new Response(
      JSON.stringify({
        ok: true,
        report: {
          ...report,
          pdf_url: pdfUrl,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in storm/complete-inspection:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function analyzeStormDamagePhotos(photos: string[]): Promise<{
  findings: any;
  damage_classification: string;
  recommendation: string;
  severity_score: number;
}> {
  // TODO: Integrate with AI service (OpenAI Vision, etc.)
  // For now, return placeholder analysis
  
  // In production, this would:
  // 1. Download photos from storage
  // 2. Send to AI vision model
  // 3. Analyze for: shingle bruising, soft metal damage, ridge dents, downspout dents, flashing damage, granule loss
  // 4. Classify damage level
  // 5. Recommend repair vs replacement

  return {
    findings: {
      shingle_bruising: false,
      soft_metal_damage: false,
      ridge_dents: 0,
      downspout_dents: 0,
      flashing_damage: false,
      granule_loss: "none",
    },
    damage_classification: "none",
    recommendation: "monitor",
    severity_score: 0,
  };
}

async function generateInspectionPDF(report: any, request: any): Promise<string | null> {
  // TODO: Generate PDF report using a PDF library
  // Include: findings, photos, recommendations, insurance-ready format
  
  // For now, return null - would generate PDF and upload to storage
  return null;
}
































