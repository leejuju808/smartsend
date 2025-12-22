// Block 12500 — Roofer Project Pipeline v1
// GET /api/pipeline/contacts
// Get all contacts with pipeline data for current workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get contacts with pipeline data
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select(`
        id,
        email,
        first_name,
        last_name,
        phone,
        company,
        tags,
        pipeline_stage,
        inspection_at,
        inspection_notes,
        estimate_amount,
        estimate_sent_at,
        estimate_pdf_url,
        job_value,
        job_won_at,
        job_notes,
        created_at,
        updated_at
      `)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (contactsError) {
      console.error("[Pipeline] Contacts error:", contactsError);
      return NextResponse.json(
        { error: "Failed to fetch contacts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      contacts: contacts || [],
    });
  } catch (error) {
    console.error("[Pipeline] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




























































