// Block 87000 — Phone Settings API
// Save/update AI phone settings

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();

    // Check if settings exist
    const { data: existing } = await supabase
      .from("ai_phone_settings")
      .select("id")
      .eq("workspace_id", workspaceId)
      .single();

    if (existing) {
      // Update
      const { error } = await supabase
        .from("ai_phone_settings")
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      // Create
      const { error } = await supabase.from("ai_phone_settings").insert({
        ...body,
        workspace_id: workspaceId,
      });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving phone settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



























