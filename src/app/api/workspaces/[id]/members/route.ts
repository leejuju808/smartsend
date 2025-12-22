// /app/api/workspaces/[id]/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspaceAdmin } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireWorkspaceAdmin(req);
  if ("error" in gate) return gate.error;

  const supabase = getServerSupabase();
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select(`
      user_id,
      role,
      added_at,
      profiles (
        email,
        full_name
      )
    `)
    .eq("workspace_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireWorkspaceAdmin(req);
  if ("error" in gate) return gate.error;

  const { user_id, role = "member" } = await req.json();
  if (!user_id) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: params.id,
      user_id,
      role
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireWorkspaceAdmin(req);
  if ("error" in gate) return gate.error;

  const { user_id } = await req.json();
  if (!user_id) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", params.id)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}