/**
 * Block 260: Bulk Importer v3 - One-Click Error Fixes API
 * Apply repair suggestions to import errors
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { errorIds } = body; // Array of error IDs to fix

    if (!errorIds || !Array.isArray(errorIds) || errorIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid errorIds" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch errors to verify they belong to user's workspace
    const { data: errors, error: fetchError } = await supabase
      .from("import_errors")
      .select("*, imports!inner(workspace_id)")
      .in("id", errorIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!errors || errors.length === 0) {
      return NextResponse.json(
        { error: "No errors found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const workspaceIds = new Set(
      errors.map((e: any) => e.imports?.workspace_id).filter(Boolean)
    );

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("workspace_id", Array.from(workspaceIds));

    const allowedWorkspaceIds = new Set(
      teamMembers?.map((tm: any) => tm.workspace_id) || []
    );

    const allowedErrors = errors.filter((e: any) =>
      allowedWorkspaceIds.has(e.imports?.workspace_id)
    );

    if (allowedErrors.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Apply fixes: update row_data with proposed_value from suggestion
    const updates = allowedErrors.map((error: any) => {
      const suggestion = error.suggestion;
      if (!suggestion || !suggestion.proposed_value) {
        return null;
      }

      const rowData = { ...error.row_data };
      rowData[suggestion.field] = suggestion.proposed_value;

      return {
        id: error.id,
        row_data: rowData,
        fixed_pending: true,
      };
    }).filter(Boolean);

    // Batch update errors
    const updatePromises = updates.map((update: any) =>
      supabase
        .from("import_errors")
        .update({
          row_data: update.row_data,
          fixed_pending: true,
        })
        .eq("id", update.id)
    );

    await Promise.all(updatePromises);

    return NextResponse.json({
      ok: true,
      fixed: updates.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}









