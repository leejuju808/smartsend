// lib/workspaces/server.ts
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";

export async function getActiveWorkspaceId() {
  const cookieStore = cookies();
  const ws = cookieStore.get("active_ws")?.value;
  if (ws) return ws;

  const supabase = getServerSupabase();
  const { data } = await supabase.from("profiles").select("default_workspace_id").maybeSingle();
  return data?.default_workspace_id ?? null;
}
