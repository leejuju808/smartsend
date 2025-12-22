// Block 32277 — SmartSend Roofing Warranty Tracker API
// POST /api/warranties/claims/detect - Auto-detect warranty claim from homeowner message

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Ensure user is authenticated
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
      homeowner_id,
      message_text,
      lead_id,
    } = body;

    if (!message_text) {
      return NextResponse.json(
        { error: "message_text is required" },
        { status: 400 }
      );
    }

    // Detect warranty claim keywords
    const messageLower = message_text.toLowerCase();
    const warrantyKeywords = [
      /\b(leak|leaking|water)\b/i,
      /\b(damage|problem|issue)\b/i,
      /\b(warranty|covered|guarantee)\b/i,
      /\b(repair|fix|broken)\b/i,
    ];

    const hasWarrantyIntent = warrantyKeywords.some(pattern => pattern.test(messageLower));
    
    if (!hasWarrantyIntent) {
      return NextResponse.json({
        detected: false,
        message: "No warranty claim detected in message",
      });
    }

    // Find active warranty for this homeowner
    const homeownerIdToUse = homeowner_id || lead_id;
    if (!homeownerIdToUse) {
      return NextResponse.json(
        { error: "homeowner_id or lead_id is required" },
        { status: 400 }
      );
    }

    const { data: warranties, error: warrantyError } = await supabase
      .from("warranties")
      .select("id, job_id, expiration_date")
      .eq("homeowner_id", homeownerIdToUse)
      .gte("expiration_date", new Date().toISOString().split("T")[0])
      .order("expiration_date", { ascending: false })
      .limit(1);

    if (warrantyError || !warranties || warranties.length === 0) {
      return NextResponse.json({
        detected: true,
        has_active_warranty: false,
        message: "Warranty claim detected but no active warranty found",
      });
    }

    const warranty = warranties[0];
    const hasUrgentKeywords = /\b(leak|leaking|water|emergency|urgent)\b/i.test(messageLower);

    // Create warranty claim
    const { data: claim, error: createError } = await supabase
      .from("warranty_claims")
      .insert({
        warranty_id: warranty.id,
        issue: hasUrgentKeywords ? "leak" : "general",
        homeowner_message: message_text,
        status: "open",
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating warranty claim:", createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    // Boost lead score
    const scoreBoost = hasUrgentKeywords ? 30 : 20;
    const { data: lead } = await supabase
      .from("leads")
      .select("score")
      .eq("id", homeownerIdToUse)
      .single();

    if (lead) {
      const currentScore = lead.score || 0;
      const newScore = Math.min(100, currentScore + scoreBoost);
      
      await supabase
        .from("leads")
        .update({ score: newScore })
        .eq("id", homeownerIdToUse);
    }

    // Create service visit task
    await supabase
      .from("service_visits")
      .insert({
        warranty_id: warranty.id,
        homeowner_id: homeownerIdToUse,
        notes: `Auto-detected warranty claim: ${message_text.substring(0, 100)}`,
      });

    return NextResponse.json({
      detected: true,
      has_active_warranty: true,
      claim,
      score_boost: scoreBoost,
      message: "Warranty claim created and service visit scheduled",
    }, { status: 201 });
  } catch (error: any) {
    console.error("Error in warranty claim detection:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































