import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id, user } = gate;
    const supabase = getServerSupabase();

    // Verify note exists and user has permission
    const { data: existingNote, error: fetchError } = await supabase
      .from("notes")
      .select("id, workspace_id, user_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !existingNote) {
      return NextResponse.json(
        { error: "Note not found" },
        { status: 404 }
      );
    }

    if (existingNote.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Note not found in workspace" },
        { status: 403 }
      );
    }

    // Check permission: user must be creator or admin
    const { data: isAdmin } = await supabase.rpc("is_workspace_admin", {
      wid: workspace_id,
    });

    if (existingNote.user_id !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Delete note
    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", params.id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete note" },
      { status: 500 }
    );
  }
}










