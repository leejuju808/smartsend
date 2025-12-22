import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// GET /api/safety/toolbox-talk/:id - Get a specific toolbox talk
export async function GET(
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

    const { data, error } = await supabase
      .from("toolbox_talks")
      .select(`
        *,
        toolbox_attendance (
          id,
          crew_member_name,
          signature_url,
          signed_at
        )
      `)
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (error) {
      console.error("Error fetching toolbox talk:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Toolbox talk not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Error in GET /api/safety/toolbox-talk/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























