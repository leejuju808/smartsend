// Block 226000 — SmartSend Roofing Safety Compliance System
// POST /api/safety/checklist/generate
// Auto-generate safety checklist based on job conditions (roof pitch, height, weather, crew size)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { dailyLogId, jobId, crewId, roofPitch, jobHeight, weatherCondition, crewSize } = await req.json();

    if (!dailyLogId || !jobId) {
      return NextResponse.json(
        { error: "dailyLogId and jobId are required" },
        { status: 400 }
      );
    }

    // Check if safety checklist already exists for this daily log
    const { data: existingChecklist } = await supabase
      .from("safety_checklists")
      .select("id")
      .eq("daily_log_id", dailyLogId)
      .eq("checklist_type", "ppe_check")
      .maybeSingle();

    if (existingChecklist) {
      return NextResponse.json({
        success: true,
        checklistId: existingChecklist.id,
        message: "Safety checklist already exists",
      });
    }

    // Determine checklist items based on job conditions
    const checklistItems: Array<{ label: string; is_required: boolean }> = [];

    // Always required PPE items
    checklistItems.push(
      { label: "Hard hat", is_required: true },
      { label: "Gloves", is_required: true },
      { label: "Eye protection", is_required: true },
      { label: "Work boots", is_required: true }
    );

    // Height-based requirements
    const height = jobHeight || 0;
    if (height > 6) {
      checklistItems.push(
        { label: "Harness", is_required: true },
        { label: "Anchors installed", is_required: true },
        { label: "Lifeline secured", is_required: true }
      );
    }

    // Roof pitch requirements
    const pitch = roofPitch || 0;
    if (pitch > 4) {
      checklistItems.push(
        { label: "Fall protection system verified", is_required: true },
        { label: "Toe boards installed", is_required: true }
      );
    }

    // Weather-based requirements
    if (weatherCondition) {
      const weather = weatherCondition.toLowerCase();
      if (weather.includes("rain") || weather.includes("wet")) {
        checklistItems.push(
          { label: "Non-slip footwear verified", is_required: true },
          { label: "Weather protection equipment", is_required: true }
        );
      }
      if (weather.includes("wind") || weather.includes("gust")) {
        checklistItems.push(
          { label: "Secure loose materials", is_required: true },
          { label: "Wind safety protocol reviewed", is_required: true }
        );
      }
      if (weather.includes("hot") || weather.includes("sun")) {
        checklistItems.push(
          { label: "Hydration available", is_required: true },
          { label: "Sun protection", is_required: true }
        );
      }
    }

    // Always required site items
    checklistItems.push(
      { label: "Ladder secured", is_required: true },
      { label: "Work zone marked", is_required: true },
      { label: "First aid kit accessible", is_required: true }
    );

    // Create safety checklist
    const { data: checklist, error: checklistError } = await supabase
      .from("safety_checklists")
      .insert({
        daily_log_id: dailyLogId,
        job_id: jobId,
        crew_id: crewId || null,
        checklist_type: "ppe_check",
      })
      .select()
      .single();

    if (checklistError) {
      console.error("Error creating safety checklist:", checklistError);
      return NextResponse.json(
        { error: "Failed to create safety checklist", details: checklistError.message },
        { status: 500 }
      );
    }

    // Insert checklist items
    const itemsToInsert = checklistItems.map((item) => ({
      checklist_id: checklist.id,
      label: item.label,
      is_required: item.is_required,
    }));

    const { error: itemsError } = await supabase
      .from("safety_checklist_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error("Error creating checklist items:", itemsError);
      return NextResponse.json(
        { error: "Failed to create checklist items", details: itemsError.message },
        { status: 500 }
      );
    }

    // Get the full checklist with items
    const { data: fullChecklist } = await supabase
      .from("safety_checklists")
      .select(`
        *,
        items:safety_checklist_items(*)
      `)
      .eq("id", checklist.id)
      .single();

    return NextResponse.json({
      success: true,
      checklist: fullChecklist,
      message: "Safety checklist generated successfully",
    });
  } catch (error: any) {
    console.error("Generate safety checklist error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























