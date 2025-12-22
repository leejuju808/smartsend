import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const supabase = createClient();
  const { id, noteId } = await params;
  const leadId = id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "not_auth" }, { status: 401 });

  const bodyJson = await req.json();
  const body: string | undefined = bodyJson.body;
  const pinned: boolean | undefined = bodyJson.pinned;
  const nextStep: string | undefined = bodyJson.next_step;
  const followUpAt: string | null | undefined = bodyJson.follow_up_at;

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  // Get note to check ownership
  const { data: note } = await supabase
    .from("lead_notes")
    .select("user_id, workspace_id")
    .eq("id", noteId)
    .single();

  if (!note) {
    return NextResponse.json({ error: "note_not_found" }, { status: 404 });
  }

  // Check workspace membership and role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", lead.workspace_id)
    .eq("user_id", user.id)
    .single();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", lead.workspace_id)
    .single();

  const isOwner = workspace?.owner_id === user.id;
  const isManager = membership?.role === "owner" || membership?.role === "admin" || membership?.role === "manager";
  const isStaff = membership?.role === "member";
  const isNoteOwner = note.user_id === user.id;

  // Permission check: Owner/Manager can edit any note, Staff can only edit their own
  if (!isOwner && !isManager && !(isStaff && isNoteOwner)) {
    return NextResponse.json({ error: "no_permission" }, { status: 403 });
  }

  const update: any = {};
  if (typeof body === "string") update.body = body;
  if (typeof pinned === "boolean") update.pinned = pinned;
  if (nextStep !== undefined) update.next_step = nextStep?.trim() || null;
  if (followUpAt !== undefined) update.follow_up_at = followUpAt || null;

  const { data, error } = await supabase
    .from("lead_notes")
    .update(update)
    .eq("id", noteId)
    .eq("workspace_id", lead.workspace_id)
    .eq("lead_id", lead.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ note: data }, { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const supabase = createClient();
  const { id, noteId } = await params;
  const leadId = id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "not_auth" }, { status: 401 });

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  // Check workspace membership and role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", lead.workspace_id)
    .eq("user_id", user.id)
    .single();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", lead.workspace_id)
    .single();

  const isOwner = workspace?.owner_id === user.id;
  const isManager = membership?.role === "owner" || membership?.role === "admin" || membership?.role === "manager";

  // Permission check: Only Owner/Manager can delete notes (Staff cannot delete)
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "no_permission" }, { status: 403 });
  }

  const { error } = await supabase
    .from("lead_notes")
    .delete()
    .eq("id", noteId)
    .eq("workspace_id", lead.workspace_id)
    .eq("lead_id", lead.id);

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ ok: true }, { status: 200 });
}

