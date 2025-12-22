// Block 238000 — SmartSend Mobile App v1
// POST /api/mobile/safety/submit
// Submit safety checklist from mobile app

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
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
      job_id,
      checklist_type, // 'daily', 'pre_job', 'incident'
      items, // Array of { question, answer, notes? }
      ppe_confirmed,
      hazard_reviewed,
      weather_acknowledged,
      fall_protection_photo_url,
      overall_score, // 1-10
      notes,
    } = body;

    if (!job_id || !checklist_type || !items) {
      return NextResponse.json(
        { error: "job_id, checklist_type, and items are required" },
        { status: 400 }
      );
    }

    // Check if safety_checklists table exists, if not use safety_logs or create entry
    // For now, we'll insert into a safety_checklists table
    const { data: checklist, error: insertError } = await supabase
      .from("safety_checklists")
      .insert({
        job_id,
        user_id: user.id,
        checklist_type,
        items: items, // Store as JSONB
        ppe_confirmed: ppe_confirmed || false,
        hazard_reviewed: hazard_reviewed || false,
        weather_acknowledged: weather_acknowledged || false,
        fall_protection_photo_url: fall_protection_photo_url || null,
        overall_score: overall_score || null,
        notes: notes || null,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // If table doesn't exist, try alternative table name
      console.error("Safety checklist insert error:", insertError);
      
      // Try safety_logs table as fallback
      const { data: logData, error: logError } = await supabase
        .from("safety_logs")
        .insert({
          job_id,
          user_id: user.id,
          log_type: checklist_type,
          data: {
            items,
            ppe_confirmed,
            hazard_reviewed,
            weather_acknowledged,
            fall_protection_photo_url,
            overall_score,
            notes,
          },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (logError) {
        return NextResponse.json(
          { error: "Failed to save safety checklist", details: logError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        checklist: logData,
      });
    }

    // If overall_score is low (< 6), create an alert
    if (overall_score && overall_score < 6) {
      await supabase.from("alerts").insert({
        job_id,
        user_id: user.id,
        alert_type: "safety_risk",
        severity: "high",
        title: "Low Safety Score",
        message: `Safety checklist submitted with score of ${overall_score}/10`,
        data: { checklist_id: checklist.id, overall_score },
      });
    }

    return NextResponse.json({
      success: true,
      checklist,
    });
  } catch (error: any) {
    console.error("Error in safety submit API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























