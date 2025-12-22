// Block 32277 — SmartSend Roofing Warranty Tracker API
// POST /api/warranties/[id]/claims - Create warranty claim

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: warrantyId } = await params;
    
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
      issue,
      homeowner_message,
      technician,
      scheduled_for,
    } = body;

    if (!issue) {
      return NextResponse.json(
        { error: "issue is required" },
        { status: 400 }
      );
    }

    // Verify warranty exists
    const { data: warranty, error: warrantyError } = await supabase
      .from("warranties")
      .select("id, homeowner_id")
      .eq("id", warrantyId)
      .single();

    if (warrantyError || !warranty) {
      return NextResponse.json(
        { error: "Warranty not found" },
        { status: 404 }
      );
    }

    const { data: claim, error: createError } = await supabase
      .from("warranty_claims")
      .insert({
        warranty_id: warrantyId,
        issue,
        homeowner_message,
        status: "open",
        technician,
        scheduled_for,
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

    // If homeowner_message mentions leak/active damage, boost lead score
    if (homeowner_message && warranty.homeowner_id) {
      const messageLower = homeowner_message.toLowerCase();
      const hasUrgentKeywords = /\b(leak|leaking|water|damage|emergency|urgent)\b/i.test(messageLower);
      
      if (hasUrgentKeywords) {
        // Boost lead score by +30 for urgent warranty claim
        const { data: lead } = await supabase
          .from("leads")
          .select("score")
          .eq("id", warranty.homeowner_id)
          .single();

        if (lead) {
          const currentScore = lead.score || 0;
          const newScore = Math.min(100, currentScore + 30);
          
          await supabase
            .from("leads")
            .update({ score: newScore })
            .eq("id", warranty.homeowner_id);
        }
      }
    }

    // Create service visit if scheduled_for is provided
    if (scheduled_for && warranty.homeowner_id) {
      await supabase
        .from("service_visits")
        .insert({
          warranty_id: warrantyId,
          homeowner_id: warranty.homeowner_id,
          scheduled_for,
          technician,
          notes: `Warranty claim: ${issue}`,
        });
    }

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error: any) {
    console.error("Error in warranty claim POST:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































