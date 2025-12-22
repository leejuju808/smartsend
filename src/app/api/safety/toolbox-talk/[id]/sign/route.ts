import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/safety/toolbox-talk/:id/sign - Add a crew member signature
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    // Verify the toolbox talk exists and belongs to the workspace
    const { data: talk, error: talkError } = await supabase
      .from("toolbox_talks")
      .select("id, workspace_id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (talkError || !talk) {
      return NextResponse.json(
        { error: "Toolbox talk not found" },
        { status: 404 }
      );
    }

    const { crew_member_name, signature_url } = await req.json();

    if (!crew_member_name) {
      return NextResponse.json(
        { error: "Missing required field: crew_member_name" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("toolbox_attendance")
      .insert({
        talk_id: params.id,
        crew_member_name,
        signature_url: signature_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding signature:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Error in POST /api/safety/toolbox-talk/[id]/sign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























