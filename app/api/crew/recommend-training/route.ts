// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// API Route: /api/crew/recommend-training
// POST - Generates training recommendations based on identified skill gaps

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface TrainingRecommendation {
  skill_area: string;
  recommendation_title: string;
  recommendation: string;
  reasoning: any;
  training_type: 'video' | 'pdf' | 'checklist' | 'on_site' | 'workshop';
  training_resource_url?: string;
  training_duration_minutes?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

// Training resource mappings
const TRAINING_RESOURCES: Record<string, {
  video_url?: string;
  pdf_url?: string;
  duration_minutes: number;
  type: 'video' | 'pdf' | 'checklist';
}> = {
  flashing: {
    video_url: "/training/flashing/step-flashing-basics",
    duration_minutes: 12,
    type: 'video'
  },
  shingle_installation: {
    video_url: "/training/shingles/nailing-patterns",
    duration_minutes: 15,
    type: 'video'
  },
  ventilation: {
    video_url: "/training/ventilation/clearance-training",
    duration_minutes: 10,
    type: 'video'
  },
  ridge: {
    video_url: "/training/ridge/alignment-techniques",
    duration_minutes: 8,
    type: 'video'
  },
  cleanup: {
    pdf_url: "/training/cleanup/checklist.pdf",
    duration_minutes: 5,
    type: 'checklist'
  },
  safety: {
    pdf_url: "/training/safety/osha-checklist.pdf",
    duration_minutes: 20,
    type: 'pdf'
  },
  tear_off: {
    video_url: "/training/tear-off/efficiency-techniques",
    duration_minutes: 18,
    type: 'video'
  },
  time_management: {
    pdf_url: "/training/time/project-planning.pdf",
    duration_minutes: 15,
    type: 'pdf'
  }
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const { crew_member_id, crew_id, job_id, workspace_id, skill_scores_id } = body;

    if (!crew_member_id && !crew_id) {
      return NextResponse.json(
        { error: "crew_member_id or crew_id is required" },
        { status: 400 }
      );
    }

    // Get skill scores to identify gaps
    let skillScores: any = null;
    
    if (skill_scores_id) {
      const { data } = await supabase
        .from("crew_skill_scores")
        .select("*")
        .eq("id", skill_scores_id)
        .single();
      skillScores = data;
    } else {
      // Get latest skill scores
      let query = supabase
        .from("crew_skill_scores")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (crew_member_id) {
        query = query.eq("crew_member_id", crew_member_id);
      } else if (crew_id) {
        query = query.eq("crew_id", crew_id);
      }
      
      if (job_id) {
        query = query.eq("job_id", job_id);
      }
      
      const { data } = await query.single();
      skillScores = data;
    }

    if (!skillScores) {
      return NextResponse.json(
        { error: "No skill scores found. Run analyze-performance first." },
        { status: 404 }
      );
    }

    const workspaceId = skillScores.workspace_id || workspace_id;

    // Verify access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Identify skill gaps (scores < 70)
    const skillGaps: TrainingRecommendation[] = [];
    const skillThreshold = 70;
    const criticalThreshold = 50;

    const skillAreas = [
      { key: "tear_off", label: "Tear-Off Speed" },
      { key: "shingle_installation", label: "Shingle Installation" },
      { key: "flashing", label: "Flashing Work" },
      { key: "ventilation", label: "Ventilation Setup" },
      { key: "ridge", label: "Ridge Cap Alignment" },
      { key: "cleanup", label: "Cleanup Quality" },
      { key: "safety", label: "Safety Compliance" },
      { key: "time_management", label: "Time Management" }
    ];

    // Get recent error patterns from analyze-performance
    let errorPatterns: any[] = [];
    if (job_id || crew_id || crew_member_id) {
      // Try to get recent analysis data
      const analysisResponse = await fetch(`${req.nextUrl.origin}/api/crew/analyze-performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id, crew_id, crew_member_id, workspace_id: workspaceId })
      });
      
      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        errorPatterns = analysisData.error_patterns || [];
      }
    }

    skillAreas.forEach(({ key, label }) => {
      const score = skillScores[key];
      if (score !== null && score !== undefined && score < skillThreshold) {
        const isCritical = score < criticalThreshold;
        const priority: 'low' | 'medium' | 'high' | 'urgent' = isCritical ? 'urgent' : score < 60 ? 'high' : 'medium';
        
        // Find related error patterns
        const relatedErrors = errorPatterns.filter(
          (ep: any) => ep.skill_area === key || ep.skill_area === key.replace('_', '-')
        );

        // Build recommendation
        let recommendationTitle = "";
        let recommendation = "";
        const reasoning: any = {
          current_score: score,
          threshold: skillThreshold,
          weakness_detected: relatedErrors.length > 0 ? relatedErrors[0].error_type : `${label.toLowerCase()} below standard`,
          evidence: relatedErrors.map((e: any) => e.description),
          impact: isCritical ? "Critical - High risk of callbacks and warranty claims" : "Moderate - May lead to quality issues"
        };

        const resource = TRAINING_RESOURCES[key];
        
        if (key === "flashing") {
          recommendationTitle = "Step Flashing Refresher";
          recommendation = `Your flashing work score is ${score}/100. ${relatedErrors.length > 0 ? relatedErrors.map((e: any) => e.description).join(" ") : "Improper step flashing installation can lead to leaks and warranty claims."} Review proper step flashing techniques, including correct overlap and nail placement.`;
        } else if (key === "shingle_installation") {
          recommendationTitle = "Proper Nailing Pattern Correction";
          recommendation = `Shingle installation score: ${score}/100. ${relatedErrors.length > 0 ? relatedErrors.map((e: any) => e.description).join(" ") : "Incorrect nailing patterns can cause shingle uplift and premature failure."} Focus on proper nail placement, spacing, and depth.`;
        } else if (key === "ventilation") {
          recommendationTitle = "Ventilation Clearance Training";
          recommendation = `Ventilation setup needs improvement (${score}/100). ${relatedErrors.length > 0 ? relatedErrors.map((e: any) => e.description).join(" ") : "Inadequate ventilation clearance can cause moisture buildup and decking deterioration."} Learn proper clearance requirements and installation techniques.`;
        } else if (key === "ridge") {
          recommendationTitle = "Ridge Cap Alignment Techniques";
          recommendation = `Ridge cap work requires attention (${score}/100). Focus on proper alignment, consistent spacing, and secure fastening.`;
        } else if (key === "cleanup") {
          recommendationTitle = "Cleanup Quality Checklist";
          recommendation = `Cleanup score: ${score}/100. Ensure thorough job site cleanup including debris removal, nail pickup, and material organization.`;
        } else if (key === "safety") {
          recommendationTitle = "OSHA Safety Compliance Review";
          recommendation = `Safety compliance score: ${score}/100. Review fall protection, equipment safety, and worksite safety protocols.`;
        } else if (key === "tear_off") {
          recommendationTitle = "Tear-Off Efficiency Techniques";
          recommendation = `Tear-off speed and efficiency can be improved (${score}/100). Learn time-saving techniques while maintaining safety.`;
        } else if (key === "time_management") {
          recommendationTitle = "Project Time Management";
          recommendation = `Time management score: ${score}/100. Improve job completion time by better planning, sequencing, and crew coordination.`;
        } else {
          recommendationTitle = `${label} Improvement Training`;
          recommendation = `Your ${label.toLowerCase()} score is ${score}/100. Focus on improving this area to reduce callbacks and warranty claims.`;
        }

        skillGaps.push({
          skill_area: key,
          recommendation_title: recommendationTitle,
          recommendation,
          reasoning,
          training_type: resource?.type || 'video',
          training_resource_url: resource?.video_url || resource?.pdf_url,
          training_duration_minutes: resource?.duration_minutes || 15,
          priority
        });
      }
    });

    // If overall score is low but no specific gaps, recommend general training
    if (skillGaps.length === 0 && skillScores.overall && skillScores.overall < skillThreshold) {
      skillGaps.push({
        skill_area: "general",
        recommendation_title: "General Workmanship Improvement",
        recommendation: `Your overall performance score is ${skillScores.overall}/100. Consider comprehensive crew training to improve workmanship quality and reduce callbacks.`,
        reasoning: {
          current_score: skillScores.overall,
          threshold: skillThreshold,
          impact: "Moderate - General improvement needed"
        },
        training_type: "workshop",
        training_duration_minutes: 60,
        priority: "medium"
      });
    }

    // Save recommendations to database
    const recommendationsToSave = skillGaps.map(gap => ({
      workspace_id: workspaceId,
      crew_member_id: skillScores.crew_member_id || crew_member_id || null,
      crew_id: skillScores.crew_id || crew_id || null,
      job_id: skillScores.job_id || job_id || null,
      skill_area: gap.skill_area,
      recommendation_title: gap.recommendation_title,
      recommendation: gap.recommendation,
      reasoning: gap.reasoning,
      training_type: gap.training_type,
      training_resource_url: gap.training_resource_url,
      training_duration_minutes: gap.training_duration_minutes,
      priority: gap.priority,
      status: "pending"
    }));

    if (recommendationsToSave.length > 0) {
      const { error: saveError } = await supabase
        .from("crew_training_recommendations")
        .insert(recommendationsToSave);

      if (saveError) {
        console.error("Error saving training recommendations:", saveError);
      }
    }

    return NextResponse.json({
      success: true,
      recommendations: skillGaps,
      recommendations_saved: recommendationsToSave.length,
      skill_gaps_identified: skillGaps.length
    });
  } catch (error: any) {
    console.error("Error in recommend-training route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























