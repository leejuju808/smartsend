// Block 11000 — Tags API
// DELETE /api/tags/[tag] - Delete a tag

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { tag } = await params;

    // First, remove all contact_tags with this tag
    const { error: contactTagsError } = await supabase
      .from("contact_tags")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("tag", tag);

    if (contactTagsError) {
      console.error("Error removing contact tags:", contactTagsError);
      return NextResponse.json({ error: contactTagsError.message }, { status: 500 });
    }

    // Then delete the tag definition
    const { error } = await supabase
      .from("org_tags")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("tag", tag);

    if (error) {
      console.error("Error deleting tag:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/tags/[tag]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































