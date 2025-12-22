// Block 256100 — Roof Health Photo Upload API
// POST /api/warranty/roof-health/upload
// Upload roof photos for AI health analysis

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      customer_id,
      job_id,
      warranty_id,
      photo_url,
      team_id,
    } = body;

    if (!customer_id || !photo_url || !team_id) {
      return NextResponse.json(
        { error: "Missing required fields: customer_id, photo_url, team_id" },
        { status: 400 }
      );
    }

    // Create roof health photo record
    const { data: photo, error: photoError } = await supabase
      .from("roof_health_photos")
      .insert({
        customer_id,
        job_id: job_id || null,
        warranty_id: warranty_id || null,
        team_id,
        photo_url,
        uploaded_by_customer: true,
        ai_analysis_complete: false,
      })
      .select()
      .single();

    if (photoError) {
      console.error("Error creating roof health photo:", photoError);
      return NextResponse.json(
        { error: photoError.message || "Failed to upload photo" },
        { status: 500 }
      );
    }

    // Trigger AI analysis (async)
    // TODO: Queue AI analysis job
    // For now, we'll call the analysis function directly
    try {
      const { data: analysisResult, error: analysisError } = await supabase
        .rpc("analyze_roof_health_photo", {
          p_photo_id: photo.id,
          p_photo_url: photo_url,
        });

      if (analysisError) {
        console.error("Error analyzing photo:", analysisError);
        // Don't fail the upload if analysis fails
      }

      // If analysis detected issues, create repair job recommendations
      if (analysisResult?.detected_issues && analysisResult.detected_issues.length > 0) {
        // TODO: Auto-create repair job via Block 255500 repair division engine
        // For now, create a recommendation record
        await supabase.from("customer_events").insert({
          customer_id,
          team_id,
          event_type: "upsell_opportunity",
          title: "Roof Health Check - Issues Detected",
          description: `AI analysis detected ${analysisResult.detected_issues.length} issue(s) in uploaded photos. Recommendations available.`,
          priority: "medium",
          status: "pending",
          related_job_id: job_id || null,
          details: {
            photo_id: photo.id,
            detected_issues: analysisResult.detected_issues,
            recommendations: analysisResult.recommendations,
            health_score: analysisResult.health_score,
          },
        });
      }
    } catch (analysisErr: any) {
      console.error("Error in async analysis:", analysisErr);
      // Don't fail the upload
    }

    // Get updated photo with analysis
    const { data: updatedPhoto, error: fetchError } = await supabase
      .from("roof_health_photos")
      .select("*")
      .eq("id", photo.id)
      .single();

    return NextResponse.json(
      { 
        photo: updatedPhoto || photo,
        message: "Photo uploaded successfully. AI analysis in progress.",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/warranty/roof-health/upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















