// lib/workspace.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getCurrentWorkspaceId() {
  const cookieStore = cookies();
  const ws = cookieStore.get("ws")?.value;
  if (ws) return ws;

  // fallback: user's first workspace
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (k) => cookieStore.get(k)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
    
  return data?.[0]?.workspace_id ?? null;
}

export async function getCurrentWorkspace() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return null;

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (k) => cookieStore.get(k)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspace_members")
    .select("role, workspaces!inner(id, name, created_at)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!data) return null;

  return {
    id: data.workspaces.id,
    name: data.workspaces.name,
    role: data.role,
    created_at: data.workspaces.created_at,
  };
}

export async function getUserWorkspaces() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (k) => cookieStore.get(k)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(id, name, created_at)")
    .eq("user_id", user.id);

  return (data || []).map((r: any) => ({
    id: r.workspaces.id,
    name: r.workspaces.name,
    role: r.role,
    created_at: r.workspaces.created_at,
  }));
}

export async function requireWorkspaceAccess(requiredRoles: string[] = ['viewer']) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    throw new Error("No workspace selected");
  }
  
  if (!requiredRoles.includes(workspace.role)) {
    throw new Error("Insufficient permissions");
  }
  
  return workspace;
}