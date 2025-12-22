// Block 13300 — Calendar & Scheduling Sync v1
// POST /api/calendar/inspections
// Create a new inspection from calendar

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { contactId, dateTime, assignedTo, notes } = body;

    // Validate required fields
    if (!contactId || !dateTime) {
      return NextResponse.json(
        { error: "contactId and dateTime are required" },
        { status: 400 }
      );
    }

    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Verify contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Update contact with inspection data
    const updateData: any = {
      inspection_at: dateTime,
      pipeline_stage: "inspection",
      updated_at: new Date().toISOString(),
    };

    if (assignedTo) {
      updateData.inspection_assigned_to = assignedTo;
    }

    if (notes) {
      updateData.inspection_notes = notes;
    }

    const { data: updatedContact, error: updateError } = await supabase
      .from("contacts")
      .update(updateData)
      .eq("id", contactId)
      .select()
      .single();

    if (updateError) {
      console.error("[Calendar] Update inspection error:", updateError);
      return NextResponse.json(
        { error: "Failed to create inspection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      contact: updatedContact,
    });
  } catch (error: any) {
    console.error("[Calendar] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























































