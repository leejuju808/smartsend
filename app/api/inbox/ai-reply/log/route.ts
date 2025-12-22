// app/api/inbox/ai-reply/log/route.ts
// Block 19840 — AI Reply Assistant v1
// Updates AI reply log when user sends an edited version

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { log_id, edited_reply, was_sent } = body;

    if (!log_id) {
      return NextResponse.json(
        { error: "log_id is required" },
        { status: 400 }
      );
    }

    // Update the log entry
    const updateData: any = {
      was_edited: edited_reply ? true : false,
      was_sent: was_sent === true,
    };

    if (edited_reply) {
      updateData.user_edited_version = edited_reply;
    }

    const { error } = await supabase
      .from("ai_reply_logs")
      .update(updateData)
      .eq("id", log_id)
      .eq("user_id", user.id); // Ensure user can only update their own logs

    if (error) {
      console.error("Error updating AI reply log:", error);
      return NextResponse.json(
        { error: "Failed to update log" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("AI reply log update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update log" },
      { status: 500 }
    );
  }
}



















































