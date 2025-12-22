/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * GET /api/lead/quality/[id]
 * Get lead quality score and verification details
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = req.nextUrl.searchParams.get("type") || "contact"; // "contact" or "lead"

    // Get verification record
    const { data: verification, error: verificationError } = await supabase
      .from("lead_verification")
      .select("*")
      .eq(type === "contact" ? "contact_id" : "lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (verificationError || !verification) {
      return NextResponse.json(
        { error: "Verification not found" },
        { status: 404 }
      );
    }

    // Get quality score history
    const { data: qualityScores } = await supabase
      .from("lead_quality_scores")
      .select("*")
      .eq(type === "contact" ? "contact_id" : "lead_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get verification timeline
    const { data: timeline } = await supabase
      .from("lead_verification_timeline")
      .select("*")
      .eq("verification_id", verification.id)
      .order("checked_at", { ascending: false });

    // Get intent types
    const { data: intentTypes } = await supabase
      .from("lead_intent_types")
      .select("*")
      .eq(type === "contact" ? "contact_id" : "lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get spam results
    const { data: spamResults } = await supabase
      .from("lead_spam_results")
      .select("*")
      .eq(type === "contact" ? "contact_id" : "lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get duplicates
    const { data: duplicates } = await supabase
      .from("lead_duplicates")
      .select("*")
      .or(`primary_contact_id.eq.${id},duplicate_contact_id.eq.${id},primary_lead_id.eq.${id},duplicate_lead_id.eq.${id}`)
      .order("detected_at", { ascending: false });

    return NextResponse.json({
      verification,
      quality_score: verification.quality_score,
      quality_category: verification.quality_category,
      red_alerts: verification.red_alerts || [],
      quality_history: qualityScores || [],
      timeline: timeline || [],
      intent: intentTypes || null,
      spam: spamResults || null,
      duplicates: duplicates || [],
    });
  } catch (error: any) {
    console.error("Error getting lead quality:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get lead quality" },
      { status: 500 }
    );
  }
}

