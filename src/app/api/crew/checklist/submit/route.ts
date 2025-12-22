// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/checklist/submit
// Marks checklist items as completed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { checklistId, itemIds, completed } = await req.json();

    if (!checklistId || !Array.isArray(itemIds)) {
      return NextResponse.json(
        { error: "checklistId and itemIds array are required" },
        { status: 400 }
      );
    }

    const completedValue = completed !== undefined ? completed : true;

    // Update checklist items
    const { data: updatedItems, error: updateError } = await supabase
      .from("crew_checklist_items")
      .update({
        completed: completedValue,
        completed_at: completedValue ? new Date().toISOString() : null,
      })
      .in("id", itemIds)
      .eq("checklist_id", checklistId)
      .select();

    if (updateError) {
      console.error("Checklist update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update checklist items", details: updateError.message },
        { status: 500 }
      );
    }

    // Get updated checklist status
    const { data: checklist } = await supabase
      .from("crew_checklists")
      .select(`
        *,
        items:crew_checklist_items(*)
      `)
      .eq("id", checklistId)
      .single();

    // Check if all required items are completed
    const allRequiredCompleted = checklist?.items?.every(
      (item: any) => !item.is_required || item.completed
    );

    return NextResponse.json({
      success: true,
      updatedItems,
      checklist: {
        ...checklist,
        allRequiredCompleted,
      },
    });
  } catch (error: any) {
    console.error("Submit checklist error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























