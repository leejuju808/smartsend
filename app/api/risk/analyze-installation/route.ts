// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// API Route: Analyze Installation for Risks
// POST /api/risk/analyze-installation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface RiskAnalysisResult {
  risk_score: number;
  risk_factors: {
    installation_risks: string[];
    material_risks: string[];
    workmanship_risks: string[];
    environmental_risks: string[];
  };
  warranty_risk: {
    probability: number;
    predicted_claim_types: string[];
    predicted_timeline_months: number[];
    estimated_cost_range: { min: number; max: number };
  };
  recommendations: Array<{
    type: string;
    priority: "low" | "medium" | "high" | "critical";
    action: string;
    reason: string;
    checklist_item?: string;
  }>;
}

/**
 * Analyzes QC photos and job data to detect installation risks
 * Helps roofers: Finds mistakes early → saves money
 */
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
    const { job_id, qc_inspection_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get QC inspection if provided
    let qcInspection = null;
    let qcPhotos: any[] = [];
    
    if (qc_inspection_id) {
      const { data: inspection } = await supabase
        .from("qc_inspections")
        .select("*")
        .eq("id", qc_inspection_id)
        .single();
      
      qcInspection = inspection;

      // Get QC photos
      const { data: photos } = await supabase
        .from("qc_photos")
        .select("*")
        .eq("qc_inspection_id", qc_inspection_id)
        .order("created_at", { ascending: false });

      qcPhotos = photos || [];
    } else {
      // Try to find latest QC inspection for this job
      const { data: latestInspection } = await supabase
        .from("qc_inspections")
        .select("id")
        .eq("job_id", job_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestInspection) {
        const { data: photos } = await supabase
          .from("qc_photos")
          .select("*")
          .eq("qc_inspection_id", latestInspection.id)
          .order("created_at", { ascending: false });

        qcPhotos = photos || [];
      }
    }

    // Prepare data for AI analysis
    const analysisData = {
      job: {
        id: job.id,
        title: job.title,
        job_type: job.job_type,
        status: job.status,
        crew_name: job.crew_name,
        scheduled_start_date: job.scheduled_start_date,
        scheduled_end_date: job.scheduled_end_date,
      },
      qc_inspection: qcInspection ? {
        score: qcInspection.score,
        status: qcInspection.status,
        checklist: qcInspection.checklist,
        photos_uploaded_count: qcInspection.photos_uploaded_count,
        photos_required_count: qcInspection.photos_required_count,
      } : null,
      qc_photos: qcPhotos.map(photo => ({
        url: photo.url,
        photo_type: photo.photo_type,
        checklist_item: photo.checklist_item,
      })),
    };

    // Call AI for risk analysis
    let riskAnalysis: RiskAnalysisResult;
    
    if (!OPENAI_API_KEY) {
      // Fallback: Basic risk analysis without AI
      riskAnalysis = generateBasicRiskAnalysis(analysisData);
    } else {
      try {
        riskAnalysis = await analyzeWithAI(analysisData);
      } catch (aiError) {
        console.error("AI analysis error, using fallback:", aiError);
        riskAnalysis = generateBasicRiskAnalysis(analysisData);
      }
    }

    // Save risk assessment to database
    const { data: assessment, error: assessmentError } = await supabase
      .from("risk_assessments")
      .insert({
        job_id: job_id,
        workspace_id: job.workspace_id,
        risk_score: riskAnalysis.risk_score,
        risk_factors: riskAnalysis.risk_factors,
        warranty_risk: riskAnalysis.warranty_risk,
        recommendations: riskAnalysis.recommendations,
        qc_inspection_id: qc_inspection_id || null,
        analyzed_by_ai: !!OPENAI_API_KEY,
      })
      .select()
      .single();

    if (assessmentError) {
      console.error("Error saving risk assessment:", assessmentError);
      // Still return the analysis even if save fails
    }

    return NextResponse.json({
      success: true,
      assessment: assessment || null,
      risk_analysis: riskAnalysis,
    });
  } catch (error: any) {
    console.error("Error in analyze-installation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * AI-powered risk analysis using OpenAI Vision
 */
async function analyzeWithAI(data: any): Promise<RiskAnalysisResult> {
  const systemPrompt = `You are an expert roofing installation risk analyst. Analyze QC photos and job data to detect:
1. Installation risks (incorrect nailing, low ventilation, flashing issues, etc.)
2. Material risks (poor quality, inadequate underlayment, etc.)
3. Workmanship risks (ridge cap misalignment, valley issues, etc.)
4. Environmental risks (weather during install, high wind area, etc.)

Return JSON with this exact structure:
{
  "risk_score": 0-100,
  "risk_factors": {
    "installation_risks": ["array of specific risks"],
    "material_risks": ["array of material issues"],
    "workmanship_risks": ["array of workmanship issues"],
    "environmental_risks": ["array of environmental factors"]
  },
  "warranty_risk": {
    "probability": 0-100,
    "predicted_claim_types": ["leak", "ventilation_failure", etc.],
    "predicted_timeline_months": [6, 12, 24],
    "estimated_cost_range": {"min": 500, "max": 5000}
  },
  "recommendations": [
    {
      "type": "immediate_fix|monitor|training",
      "priority": "low|medium|high|critical",
      "action": "Specific action to take",
      "reason": "Why this is needed",
      "checklist_item": "Related QC item if applicable"
    }
  ]
}`;

  // Build photo analysis content
  const photoContent: any[] = [];
  
  if (data.qc_photos && data.qc_photos.length > 0) {
    // Analyze up to 10 photos (OpenAI limit)
    const photosToAnalyze = data.qc_photos.slice(0, 10);
    
    for (const photo of photosToAnalyze) {
      photoContent.push({
        type: "image_url",
        image_url: { url: photo.url },
      });
    }
  }

  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this roofing installation for risks. Job data: ${JSON.stringify(data.job)}. QC Inspection: ${JSON.stringify(data.qc_inspection)}. ${data.qc_photos.length} photos provided.`,
        },
        ...photoContent,
      ],
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o", // Vision-capable model
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const result = await response.json();
  const content = JSON.parse(result.choices[0]?.message?.content || "{}");

  return {
    risk_score: content.risk_score || 0,
    risk_factors: content.risk_factors || {
      installation_risks: [],
      material_risks: [],
      workmanship_risks: [],
      environmental_risks: [],
    },
    warranty_risk: content.warranty_risk || {
      probability: 0,
      predicted_claim_types: [],
      predicted_timeline_months: [],
      estimated_cost_range: { min: 0, max: 0 },
    },
    recommendations: content.recommendations || [],
  };
}

/**
 * Fallback risk analysis when AI is not available
 */
function generateBasicRiskAnalysis(data: any): RiskAnalysisResult {
  let riskScore = 20; // Start with low risk
  const riskFactors = {
    installation_risks: [] as string[],
    material_risks: [] as string[],
    workmanship_risks: [] as string[],
    environmental_risks: [] as string[],
  };
  const recommendations: any[] = [];

  // Check QC inspection score
  if (data.qc_inspection) {
    if (data.qc_inspection.score < 70) {
      riskScore += 30;
      riskFactors.workmanship_risks.push("Low QC score indicates quality issues");
      recommendations.push({
        type: "immediate_fix",
        priority: "high",
        action: "Review failed QC items",
        reason: "QC score below acceptable threshold",
      });
    }

    // Check photo coverage
    const photoCoverage = data.qc_inspection.photos_uploaded_count / Math.max(data.qc_inspection.photos_required_count, 1);
    if (photoCoverage < 0.8) {
      riskScore += 15;
      riskFactors.installation_risks.push("Insufficient photo documentation");
      recommendations.push({
        type: "monitor",
        priority: "medium",
        action: "Request additional QC photos",
        reason: "Photo coverage below 80%",
      });
    }
  }

  // Check if no QC inspection exists
  if (!data.qc_inspection) {
    riskScore += 25;
    riskFactors.installation_risks.push("No QC inspection completed");
    recommendations.push({
      type: "immediate_fix",
      priority: "high",
      action: "Complete QC inspection",
      reason: "No quality control documentation available",
    });
  }

  return {
    risk_score: Math.min(riskScore, 100),
    risk_factors: riskFactors,
    warranty_risk: {
      probability: Math.min(riskScore + 10, 100),
      predicted_claim_types: riskScore > 50 ? ["leak", "ventilation_failure"] : [],
      predicted_timeline_months: riskScore > 50 ? [6, 12] : [24],
      estimated_cost_range: {
        min: riskScore > 50 ? 500 : 200,
        max: riskScore > 50 ? 3000 : 1000,
      },
    },
    recommendations,
  };
}




























