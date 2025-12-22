"use server";
import { getServerSupabase } from "@/lib/supabase/server";
import crypto from "node:crypto";

export async function createWorkspace(name: string) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: ws, error } = await supabase.from("workspaces")
    .insert({ name, owner_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("workspace_members").insert({
    workspace_id: ws.id, user_id: user.id, role: "owner",
  });

  return ws.id as string;
}

export async function inviteMember(workspaceId: string, email: string, role: "admin"|"editor"|"viewer") {
  const supabase = getServerSupabase();

  // authorization: ensure caller is owner/admin
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
    .single();
  if (!member || !["owner","admin"].includes(member.role)) throw new Error("Forbidden");

  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 1000*60*60*24*7).toISOString(); // 7 days

  const { error: insErr } = await supabase.from("workspace_invites")
    .insert({ workspace_id: workspaceId, email, role, token, expires_at: expires });
  if (insErr) throw new Error(insErr.message);

  // Send invite email via your provider-send function
  const acceptUrl = `${process.env.NEXT_PUBLIC_FUNCTIONS_BASE}/accept-invite?t=${token}&u={{AUTH_USER_ID}}`;
  const html = `
    <p>You've been invited to join a SmartSend workspace.</p>
    <p><a href="${acceptUrl}">Accept invite</a> (you'll be asked to sign in)</p>
  `;

  // (Call your Edge Function / provider)
  // await fetch(`${process.env.NEXT_PUBLIC_FUNCTIONS_BASE}/provider-send`, { ... })

  return { ok: true };
}

export async function listMembers(workspaceId: string) {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  return data ?? [];
}

export async function getWorkspaces() {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getWorkspace(workspaceId: string) {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .single();
  return data;
}