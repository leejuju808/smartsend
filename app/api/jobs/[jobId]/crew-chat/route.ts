// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// API Route: Crew ↔ Roofer Communication Chat
// GET/POST /api/jobs/[jobId]/crew-chat

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { message_text, attachments, sender_type, sender_id, sender_name } = body;

    if (!message_text) {
      return NextResponse.json(
        { error: "message_text is required" },
        { status: 400 }
      );
    }

    // Verify job exists and get workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Determine sender info
    let finalSenderType = sender_type || "roofer";
    let finalSenderId = sender_id || user.id;
    let finalSenderName = sender_name;

    if (!finalSenderName) {
      if (finalSenderType === "roofer") {
        // Get user name
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .single();
        finalSenderName = profile?.full_name || profile?.email || "Roofer";
      } else if (finalSenderType === "crew") {
        // Get crew member name
        const { data: crewMember } = await supabase
          .from("crew_members")
          .select("name")
          .eq("id", finalSenderId)
          .single();
        finalSenderName = crewMember?.name || "Crew Member";
      }
    }

    // Create chat message
    const { data: message, error: messageError } = await supabase
      .from("crew_job_chat")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        sender_type: finalSenderType,
        sender_id: finalSenderId,
        sender_name: finalSenderName,
        message_text,
        attachments: attachments || [],
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating chat message:", messageError);
      return NextResponse.json(
        { error: messageError.message || "Failed to create message" },
        { status: 500 }
      );
    }

    // Notify other participants (roofers if crew sent, crew if roofer sent)
    if (finalSenderType === "crew") {
      // Notify roofers
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", job.workspace_id)
        .in("role", ["owner", "admin"]);

      if (members) {
        for (const member of members) {
          await supabase.from("notifications").insert({
            user_id: member.user_id,
            workspace_id: job.workspace_id,
            type: "crew_message",
            title: "New Message from Crew",
            body: `${finalSenderName}: ${message_text.slice(0, 100)}`,
            metadata: { job_id: jobId, message_id: message.id },
          });
        }
      }
    }

    return NextResponse.json(
      { message },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew chat:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get chat messages
    const { data: messages, error: messagesError } = await supabase
      .from("crew_job_chat")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching chat messages:", messagesError);
      return NextResponse.json(
        { error: messagesError.message || "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Mark messages as read for this user
    await supabase
      .from("crew_job_chat")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        read_by: user.id,
      })
      .eq("job_id", jobId)
      .eq("is_read", false);

    return NextResponse.json(
      { messages: messages || [] },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching crew chat:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































