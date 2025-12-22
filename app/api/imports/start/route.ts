import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/imports/start
 * Creates a new import record
 * 
 * Body: {
 *   filename: string,
 *   mapping: { email: string, first_name?: string, ... },
 *   workspaceId: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { filename, mapping, workspaceId } = body;

    if (!filename || !mapping || !workspaceId) {
      return NextResponse.json(
        { error: "Missing filename, mapping, or workspaceId" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Create import record
    const { data: importRecord, error: insertError } = await supabase
      .from("imports")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        filename,
        mapping,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ import_id: importRecord.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to start import" },
      { status: 500 }
    );
  }
}









