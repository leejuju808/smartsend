// API endpoint for phone quality insights
// GET /api/insights/phone-quality

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!orgMember?.org_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get phone intelligence statistics
    const { data: phoneStats, error: statsError } = await supabase
      .from("phone_intelligence")
      .select("line_type, sms_readiness, is_valid, is_disconnected, quality_score, homeowner_likelihood")
      .eq("org_id", orgMember.org_id);

    if (statsError) {
      return NextResponse.json(
        { error: "Failed to fetch phone statistics" },
        { status: 500 }
      );
    }

    // Calculate statistics
    const total = phoneStats?.length || 0;
    const mobile = phoneStats?.filter((p) => p.line_type === "mobile").length || 0;
    const landline = phoneStats?.filter((p) => p.line_type === "landline").length || 0;
    const voip = phoneStats?.filter((p) => p.line_type === "voip").length || 0;
    const disconnected = phoneStats?.filter((p) => p.is_disconnected).length || 0;
    const smsReady = phoneStats?.filter((p) => p.sms_readiness === "sms_ready").length || 0;
    const valid = phoneStats?.filter((p) => p.is_valid).length || 0;

    // Quality score distribution
    const highQuality = phoneStats?.filter((p) => p.quality_score >= 90).length || 0;
    const normalQuality = phoneStats?.filter((p) => p.quality_score >= 70 && p.quality_score < 90).length || 0;
    const lowQuality = phoneStats?.filter((p) => p.quality_score >= 50 && p.quality_score < 70).length || 0;
    const suspectQuality = phoneStats?.filter((p) => p.quality_score < 50).length || 0;

    // Homeowner likelihood distribution
    const highHomeowner = phoneStats?.filter((p) => p.homeowner_likelihood === "high").length || 0;
    const mediumHomeowner = phoneStats?.filter((p) => p.homeowner_likelihood === "medium").length || 0;
    const lowHomeowner = phoneStats?.filter((p) => p.homeowner_likelihood === "low").length || 0;
    const unlikelyHomeowner = phoneStats?.filter((p) => p.homeowner_likelihood === "unlikely").length || 0;

    // Average quality score
    const avgQualityScore = phoneStats && phoneStats.length > 0
      ? phoneStats.reduce((sum, p) => sum + (p.quality_score || 0), 0) / phoneStats.length
      : 0;

    return NextResponse.json({
      total,
      lineTypes: {
        mobile,
        landline,
        voip,
        mobilePercent: total > 0 ? Math.round((mobile / total) * 100) : 0,
        landlinePercent: total > 0 ? Math.round((landline / total) * 100) : 0,
        voipPercent: total > 0 ? Math.round((voip / total) * 100) : 0,
      },
      status: {
        valid,
        disconnected,
        validPercent: total > 0 ? Math.round((valid / total) * 100) : 0,
        disconnectedPercent: total > 0 ? Math.round((disconnected / total) * 100) : 0,
      },
      sms: {
        ready: smsReady,
        readyPercent: total > 0 ? Math.round((smsReady / total) * 100) : 0,
      },
      qualityDistribution: {
        high: highQuality,
        normal: normalQuality,
        low: lowQuality,
        suspect: suspectQuality,
        highPercent: total > 0 ? Math.round((highQuality / total) * 100) : 0,
        normalPercent: total > 0 ? Math.round((normalQuality / total) * 100) : 0,
        lowPercent: total > 0 ? Math.round((lowQuality / total) * 100) : 0,
        suspectPercent: total > 0 ? Math.round((suspectQuality / total) * 100) : 0,
      },
      homeownerDistribution: {
        high: highHomeowner,
        medium: mediumHomeowner,
        low: lowHomeowner,
        unlikely: unlikelyHomeowner,
        highPercent: total > 0 ? Math.round((highHomeowner / total) * 100) : 0,
        mediumPercent: total > 0 ? Math.round((mediumHomeowner / total) * 100) : 0,
        lowPercent: total > 0 ? Math.round((lowHomeowner / total) * 100) : 0,
        unlikelyPercent: total > 0 ? Math.round((unlikelyHomeowner / total) * 100) : 0,
      },
      averageQualityScore: Math.round(avgQualityScore),
    });
  } catch (error: any) {
    console.error("Error fetching phone quality insights:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch phone quality insights" },
      { status: 500 }
    );
  }
}





















































