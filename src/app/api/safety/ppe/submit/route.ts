// Block 226000 — SmartSend Roofing Safety Compliance System
// POST /api/safety/ppe/submit
// Submit PPE check - REQUIRED before job start. Blocks job if any required item is missing.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      checklistId,
      dailyLogId,
      jobId,
      items, // Array of { itemId, completed }
    } = await req.json();

    if (!checklistId || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "checklistId and items array are required" },
        { status: 400 }
      );
    }

    // Update all checklist items
    const updatePromises = items.map((item: { itemId: string; completed: boolean }) =>
      supabase
        .from("safety_checklist_items")
        .update({
          completed: item.completed,
          completed_at: item.completed ? new Date().toISOString() : null,
        })
        .eq("id", item.itemId)
    );

    await Promise.all(updatePromises);

    // Check if all required items are completed
    const { data: checklistData } = await supabase
      .from("safety_checklists")
      .select(`
        id,
        completed,
        items:safety_checklist_items!inner(id, label, is_required, completed)
      `)
      .eq("id", checklistId)
      .single();

    if (!checklistData) {
      return NextResponse.json(
        { error: "Checklist not found" },
        { status: 404 }
      );
    }

    const requiredItems = checklistData.items.filter((item: any) => item.is_required);
    const completedRequiredItems = requiredItems.filter((item: any) => item.completed);
    const allRequiredComplete = requiredItems.length === completedRequiredItems.length;

    // If not all required items are complete, block job start
    if (!allRequiredComplete) {
      const missingItems = requiredItems
        .filter((item: any) => !item.completed)
        .map((item: any) => item.label);

      // Update job safety status if jobId provided
      if (jobId) {
        // Try to update jobs table
        await supabase
          .from("jobs")
          .update({ safety_status: "blocked" })
          .eq("id", jobId)
          .then(() => {})
          .catch(() => {}); // Ignore if table doesn't exist

        // Try to update roofing_jobs table
        await supabase
          .from("roofing_jobs")
          .update({ safety_status: "blocked" })
          .eq("id", jobId)
          .then(() => {})
          .catch(() => {}); // Ignore if table doesn't exist
      }

      return NextResponse.json(
        {
          success: false,
          blocked: true,
          missingItems,
          message: "Job start blocked: Required PPE items not completed",
        },
        { status: 403 }
      );
    }

    // All required items complete - allow job to proceed
    if (jobId) {
      // Clear safety block if it exists
      await supabase
        .from("jobs")
        .update({ safety_status: "clear" })
        .eq("id", jobId)
        .then(() => {})
        .catch(() => {});

      await supabase
        .from("roofing_jobs")
        .update({ safety_status: "clear" })
        .eq("id", jobId)
        .then(() => {})
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      blocked: false,
      checklist: checklistData,
      message: "PPE check completed successfully. Job can proceed.",
    });
  } catch (error: any) {
    console.error("Submit PPE check error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























