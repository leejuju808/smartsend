// lib/api-helpers.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function getCurrentWorkspaceIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("ws")?.value || null;
}

export async function requireWorkspaceAccess() {
  const cookieStore = await cookies();
  const workspaceId = cookieStore.get("ws")?.value;
  
  if (!workspaceId) {
    throw new Error("No workspace selected");
  }
  
  return workspaceId;
}

export async function getUserAndWorkspace() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error("Unauthorized");
  }
  
  const workspaceId = await requireWorkspaceAccess();
  
  return { user, workspaceId, supabase };
}