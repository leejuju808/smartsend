// Block 10700 — Reply Thread Notes API
// GET /api/inbox/replies/[threadId]/notes - List notes for a thread
// POST /api/inbox/replies/[threadId]/notes - Create a new note

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace membership
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);

  // Verify thread exists and user has access
  const { data: thread } = await supabase
    .from("reply_threads")
    .select("workspace_id")
    .eq("id", threadId)
    .in("workspace_id", workspaceIds)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get notes for this thread
  const { data: notes, error: notesError } = await supabase
    .from("reply_thread_notes")
    .select(`
      id,
      body,
      created_at,
      author_id,
      profiles:author_id (
        id,
        full_name,
        email,
        avatar_url
      )
    `)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });

  if (notesError) {
    console.error("Error fetching notes:", notesError);
    return NextResponse.json({ error: notesError.message }, { status: 500 });
  }

  return NextResponse.json({
    notes: (notes || []).map((note: any) => ({
      id: note.id,
      body: note.body,
      createdAt: note.created_at,
      authorId: note.author_id,
      authorName: note.profiles?.full_name || note.profiles?.email || "Unknown",
      authorAvatar: note.profiles?.avatar_url || null,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate request body
  if (!body.body || typeof body.body !== "string" || body.body.trim().length === 0) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  // Get workspace membership
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);

  // Verify thread exists and user has access
  const { data: thread } = await supabase
    .from("reply_threads")
    .select("workspace_id")
    .eq("id", threadId)
    .in("workspace_id", workspaceIds)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Create note
  const { data: note, error: noteError } = await supabase
    .from("reply_thread_notes")
    .insert({
      workspace_id: thread.workspace_id,
      thread_id: threadId,
      author_id: user.id,
      body: body.body.trim(),
    })
    .select(`
      id,
      body,
      created_at,
      author_id,
      profiles:author_id (
        id,
        full_name,
        email,
        avatar_url
      )
    `)
    .single();

  if (noteError) {
    console.error("Error creating note:", noteError);
    return NextResponse.json({ error: noteError.message }, { status: 500 });
  }

  return NextResponse.json({
    note: {
      id: note.id,
      body: note.body,
      createdAt: note.created_at,
      authorId: note.author_id,
      authorName: note.profiles?.full_name || note.profiles?.email || "Unknown",
      authorAvatar: note.profiles?.avatar_url || null,
    },
  });
}





























































