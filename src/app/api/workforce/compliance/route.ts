// GET /api/workforce/compliance - Get compliance risk data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // 'certifications' | 'training' | 'summary'

    // Get certification status
    const { data: certStatus, error: certError } = await supabase
      .from("workforce_certification_status")
      .select("*")
      .eq("company_id", companyId);

    if (certError) {
      console.error("Error fetching certification status:", certError);
    }

    // Get training risk
    const { data: trainingRisk, error: trainingError } = await supabase
      .from("workforce_training_risk")
      .select("*")
      .eq("company_id", companyId);

    if (trainingError) {
      console.error("Error fetching training risk:", trainingError);
    }

    // Calculate summary counts
    const certSummary = {
      expired: certStatus?.filter((c) => c.status === "expired").length || 0,
      expiring_7: certStatus?.filter((c) => c.status === "expiring_7").length || 0,
      expiring_30: certStatus?.filter((c) => c.status === "expiring_30").length || 0,
      valid: certStatus?.filter((c) => c.status === "valid").length || 0,
      unknown: certStatus?.filter((c) => c.status === "unknown").length || 0,
    };

    const trainingSummary = {
      high: trainingRisk?.filter((t) => t.risk_level === "high").length || 0,
      medium: trainingRisk?.filter((t) => t.risk_level === "medium").length || 0,
      low: trainingRisk?.filter((t) => t.risk_level === "low").length || 0,
      none_required: trainingRisk?.filter((t) => t.risk_level === "none_required").length || 0,
    };

    if (type === "certifications") {
      return NextResponse.json({
        certifications: certStatus || [],
        summary: certSummary,
      });
    }

    if (type === "training") {
      return NextResponse.json({
        training: trainingRisk || [],
        summary: trainingSummary,
      });
    }

    // Default: return summary
    return NextResponse.json({
      certifications: {
        data: certStatus || [],
        summary: certSummary,
      },
      training: {
        data: trainingRisk || [],
        summary: trainingSummary,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/compliance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























