import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { logTeamActivity } from "@/lib/team-activity";

// Helper to check if user is admin/owner
async function checkAdminAccess(supabase: any, workspaceId: string, userId: string): Promise<boolean> {
  // Check team_members first
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (teamMember && (teamMember.role === 'owner' || teamMember.role === 'admin')) {
    return true;
  }

  // Fallback to workspace_members
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return workspaceMember && (workspaceMember.role === 'owner' || workspaceMember.role === 'admin');
}

// POST /api/settings/general - Update workspace general settings
export async function POST(req: Request) {
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

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase, workspace_id, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Only Owners/Admins can edit settings" }, { status: 403 });
    }

    const body = await req.json();
    const { workspace } = body;

    if (!workspace) {
      return NextResponse.json({ error: "workspace settings required" }, { status: 400 });
    }

    // Update workspace name in workspaces table if provided
    if (workspace.name) {
      const { error: workspaceError } = await supabase
        .from("workspaces")
        .update({ name: workspace.name })
        .eq("id", workspace_id);

      if (workspaceError) {
        return NextResponse.json({ error: workspaceError.message }, { status: 500 });
      }
    }

    // Get current settings
    const { data: currentSettings } = await supabase
      .from("workspace_settings")
      .select("settings")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const current = currentSettings?.settings || {};
    const updated = {
      ...current,
      workspace: {
        ...current.workspace,
        ...workspace
      }
    };

    // Upsert settings
    const { data, error } = await supabase
      .from("workspace_settings")
      .upsert({
        workspace_id,
        settings: updated,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log activity
    await logTeamActivity({
      workspaceId: workspace_id,
      userId: user.id,
      type: "settings_updated",
      title: "Workspace general settings updated",
      metadata: { section: "workspace" }
    });

    return NextResponse.json({ ok: true, settings: data.settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

