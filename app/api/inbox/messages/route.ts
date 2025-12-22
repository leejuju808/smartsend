// Block 20140 — Fetch Conversation Messages

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const conversation_id = searchParams.get("conversation_id");

  if (!conversation_id || typeof conversation_id !== "string") {
    return NextResponse.json(
      { error: "conversation_id required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", conversation_id) // thread_id is our conversation_id equivalent
      .order("sent_at", { ascending: true });

    if (error) {
      console.error("Messages fetch error", error);
      return NextResponse.json(
        { error: "Failed to load messages" },
        { status: 500 }
      );
    }

    // Transform data to match expected format
    const messages = (data || []).map((msg) => ({
      id: msg.id,
      conversation_id: msg.thread_id, // Map thread_id to conversation_id for API consistency
      direction: msg.direction === "inbound" ? "inbound" : "outbound",
      subject: msg.subject,
      body: msg.body || msg.body_html || msg.body_text || "",
      sent_at: msg.sent_at || msg.received_at || msg.created_at,
      raw_metadata: msg.raw_metadata || {},
      automation_tag: msg.automation_tag || null,
      automation_meta: msg.automation_meta || null,
    }));

    return NextResponse.json({ messages }, { status: 200 });
  } catch (error: any) {
    console.error("Error in /api/inbox/messages:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

