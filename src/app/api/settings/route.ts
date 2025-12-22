import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

// GET /api/settings - Get all workspace settings
export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Get workspace name
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspace_id)
      .single();

    // Get settings or use defaults via function
    const { data: settingsData, error } = await supabase
      .rpc('get_workspace_settings', { p_workspace_id: workspace_id });

    let settings: any = {};
    
    if (error) {
      // Fallback: try direct select
      const { data: directData, error: directError } = await supabase
        .from("workspace_settings")
        .select("settings")
        .eq("workspace_id", workspace_id)
        .maybeSingle();

      if (directError) {
        return NextResponse.json({ error: directError.message }, { status: 500 });
      }

      settings = directData?.settings || {};
    } else {
      settings = settingsData || {};
    }

    // Merge workspace name if available
    if (workspace?.name) {
      settings.workspace = {
        ...settings.workspace,
        name: workspace.name
      };
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
