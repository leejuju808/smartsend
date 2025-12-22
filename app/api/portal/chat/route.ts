// Block 200000 — SmartSend Roofing Homeowner Portal Chat API
// POST /api/portal/chat
// Send a chat message from homeowner to contractor

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("portal_session")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { message } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get portal session
    const { data: session, error: sessionError } = await supabase
      .from("homeowner_portal_sessions")
      .select("portal_id, portal:homeowner_portals!inner(job_id, homeowner_name)")
      .eq("session_token", sessionToken)
      .eq("expires_at", ">", new Date().toISOString())
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const portal = session.portal as any;

    // Insert chat message
    const { data: chatMessage, error: insertError } = await supabase
      .from("homeowner_portal_chat_messages")
      .insert({
        portal_id: session.portal_id,
        job_id: portal.job_id,
        message_type: "homeowner",
        sender_name: portal.homeowner_name || "Homeowner",
        body: message.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Chat message insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Also add to unified_messages if table exists (integration with Block 150000)
    // This allows chat messages to appear in the contractor's unified inbox
    const { error: unifiedError } = await supabase.from("messages").insert({
      company_id: portal.company_id, // Would need to get from portal
      lead_id: portal.lead_id, // Would need to get from job
      channel: "portal_chat",
      direction: "incoming",
      sender: portal.homeowner_name || "Homeowner",
      body: message.trim(),
      metadata: {
        portal_message_id: chatMessage.id,
        job_id: portal.job_id,
      },
    }).then(() => null).catch(() => null); // Ignore errors if table doesn't exist

    return NextResponse.json({
      success: true,
      message: chatMessage,
    });
  } catch (error: any) {
    console.error("Chat message error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/portal/chat - Get chat messages
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("portal_session")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get portal session
    const { data: session, error: sessionError } = await supabase
      .from("homeowner_portal_sessions")
      .select("portal_id")
      .eq("session_token", sessionToken)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // Get chat messages
    const { data: messages, error: messagesError } = await supabase
      .from("homeowner_portal_chat_messages")
      .select("*")
      .eq("portal_id", session.portal_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (messagesError) {
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      messages: messages.reverse(), // Return in chronological order
    });
  } catch (error: any) {
    console.error("Chat fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























