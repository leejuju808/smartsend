import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { logTeamActivity } from "@/lib/team-activity";

// Helper to check if user is admin/owner
async function checkAdminAccess(supabase: any, workspaceId: string, userId: string): Promise<boolean> {
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

  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return workspaceMember && (workspaceMember.role === 'owner' || workspaceMember.role === 'admin');
}

// POST /api/settings/permissions - Update permissions settings
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

    const isAdmin = await checkAdminAccess(supabase, workspace_id, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: "Only Owners/Admins can edit settings" }, { status: 403 });
    }

    const body = await req.json();
    const { permissions } = body;

    if (!permissions) {
      return NextResponse.json({ error: "permissions settings required" }, { status: 400 });
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
      permissions: {
        ...current.permissions,
        ...permissions
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
      title: "Permissions & roles updated",
      metadata: { section: "permissions" }
    });

    return NextResponse.json({ ok: true, settings: data.settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








