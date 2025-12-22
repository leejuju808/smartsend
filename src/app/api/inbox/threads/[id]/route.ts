// GET /api/inbox/threads/[id] - Get thread detail with messages
// POST /api/inbox/threads/[id]/reply - Send reply in thread

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const threadId = params.id;

  try {
    // Get thread with lead info
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("inbox_threads")
      .select(
        `
        id,
        lead_id,
        last_message,
        summary,
        last_intent,
        urgency,
        status,
        unread_count,
        updated_at,
        created_at,
        leads:lead_id (
          id,
          first_name,
          last_name,
          name,
          email,
          phone,
          status
        )
        `
      )
      .eq("id", threadId)
      .eq("workspace_id", workspace_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get all messages in thread
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Get tasks for this thread
    const { data: tasks } = await supabaseAdmin
      .from("inbox_tasks")
      .select("*")
      .eq("thread_id", threadId)
      .eq("completed", false)
      .order("due_at", { ascending: true });

    // Mark thread as read
    await supabaseAdmin.rpc("mark_inbox_thread_read", {
      p_thread_id: threadId,
    });

    return NextResponse.json({
      thread: {
        id: thread.id,
        leadId: thread.lead_id,
        lead: thread.leads
          ? {
              id: thread.leads.id,
              name:
                thread.leads.first_name || thread.leads.last_name
                  ? `${thread.leads.first_name || ""} ${thread.leads.last_name || ""}`.trim()
                  : thread.leads.name || thread.leads.email,
              email: thread.leads.email,
              phone: thread.leads.phone,
              status: thread.leads.status,
            }
          : null,
        lastMessage: thread.last_message,
        summary: thread.summary,
        intent: thread.last_intent,
        urgency: thread.urgency,
        status: thread.status,
        unreadCount: thread.unread_count,
        updatedAt: thread.updated_at,
        createdAt: thread.created_at,
      },
      messages: (messages || []).map((msg: any) => ({
        id: msg.id,
        direction: msg.direction,
        content: msg.content,
        channel: msg.channel,
        intent: msg.intent,
        aiSummary: msg.ai_summary,
        senderEmail: msg.sender_email,
        senderName: msg.sender_name,
        subject: msg.subject,
        createdAt: msg.created_at,
      })),
      tasks: (tasks || []).map((task: any) => ({
        id: task.id,
        description: task.description,
        dueAt: task.due_at,
        taskType: task.task_type,
        completed: task.completed,
        createdAt: task.created_at,
      })),
    });
  } catch (error) {
    console.error("Error in thread detail API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id, user } = gate;
  const threadId = params.id;
  const body = await req.json();

  const { content, subject } = body;

  if (!content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  try {
    // Get thread to find lead_id
    const { data: thread } = await supabaseAdmin
      .from("inbox_threads")
      .select("lead_id")
      .eq("id", threadId)
      .eq("workspace_id", workspace_id)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Insert outbound message
    const { data: message, error: insertError } = await supabaseAdmin
      .from("inbox_messages")
      .insert({
        workspace_id,
        thread_id: threadId,
        lead_id: thread.lead_id,
        direction: "outbound",
        content,
        channel: "email",
        subject,
        sender_name: user.email || "Team",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting reply:", insertError);
      return NextResponse.json(
        { error: "Failed to send reply" },
        { status: 500 }
      );
    }

    // TODO: Actually send the email via your email service (Resend, Gmail API, etc.)
    // For now, we just log it

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Error in send reply API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































