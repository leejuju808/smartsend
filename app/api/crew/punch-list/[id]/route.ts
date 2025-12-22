// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Update Punch List Item
// PATCH /api/crew/punch-list/[id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();
    const { status, completed_by } = body;

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    const updateData: any = {
      status,
    };

    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
      if (completed_by) {
        updateData.completed_by = completed_by;
      }
    }

    const { data: punchItem, error } = await supabase
      .from("punch_list")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating punch item:", error);
      return NextResponse.json(
        { error: "Failed to update punch item" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      punch_item: punchItem,
    });
  } catch (error: any) {
    console.error("Error in update punch item API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































