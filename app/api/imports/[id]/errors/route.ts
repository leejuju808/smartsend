import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/imports/[id]/errors
 * Returns all errors for a specific import
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // First verify user has access to this import
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .select("workspace_id")
      .eq("id", id)
      .single();

    if (importError || !importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("workspace_id", importRecord.workspace_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Get errors (Block 260: Include suggestions and fixed_pending status)
    const { data: errors, error } = await supabase
      .from("import_errors")
      .select("id, row_data, error_message, suggestion, fixed_pending, created_at")
      .eq("import_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(errors || []);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch errors" },
      { status: 500 }
    );
  }
}

