// /lib/workspace/context.ts
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";

export async function getActiveWorkspaceId() {
  // Prefer explicit header/query in API calls, else cookie/session default
  const cookieStore = await cookies();
  const wid = cookieStore.get("active_wid")?.value;
  if (wid) return wid;

  const supabase = getServerSupabase();
  const { data: profile } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .limit(1)
    .maybeSingle();

  return profile?.workspace_id ?? null;
}

export async function getUserWorkspaces() {
  const supabase = getServerSupabase();
  const { data: workspaces, error } = await supabase
    .from("workspace_members")
    .select(`
      workspace_id,
      role,
      workspaces (
        id,
        name,
        created_at
      )
    `);

  if (error) {
    console.error("Error fetching user workspaces:", error);
    return [];
  }

  return workspaces?.map(w => ({
    id: w.workspace_id,
    name: w.workspaces.name,
    role: w.role,
    created_at: w.workspaces.created_at
  })) ?? [];
}

export async function createWorkspace(name: string) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("User not authenticated");

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({ name, created_by: user.id })
    .select()
    .single();

  if (workspaceError) throw workspaceError;

  // Add creator as owner
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "owner"
    });

  if (memberError) throw memberError;

  return workspace;
}