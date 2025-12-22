// app/api/inbox/[id]/task/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const messageId = params.id;
  const body = await req.json();
  const { title, due_at } = body as { title?: string; due_at?: string };

  const { data: msg, error } = await supabase
    .from("email_messages")
    .select("id, workspace_id, contact_id, body")
    .eq("id", messageId)
    .single();

  if (error || !msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskTitle =
    title || "Follow up with homeowner about roof estimate";

  const dueAt =
    due_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default = tomorrow

  // Insert task with workspace_id (most common structure)
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      workspace_id: msg.workspace_id,
      contact_id: msg.contact_id,
      title: taskTitle,
      due_at: dueAt,
      status: "open",
      source: "inbox",
      type: "call",
    })
    .select("*")
    .single();

  if (taskError) {
    return NextResponse.json(
      { error: taskError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ task });
}

