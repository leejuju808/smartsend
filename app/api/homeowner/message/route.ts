// Block 253900 — SmartSend Customer Experience Engine v1
// POST /api/homeowner/message
// Send message from homeowner to PM (or PM to homeowner)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { portal_key, message_text, sender_type = "homeowner" } = body;

    if (!portal_key || !message_text) {
      return NextResponse.json(
        { error: "Portal key and message text are required" },
        { status: 400 }
      );
    }

    // Validate portal key and get homeowner account
    const { data: homeownerAccount, error: accountError } = await supabase
      .from("homeowner_accounts")
      .select("*")
      .eq("portal_key", portal_key)
      .eq("is_active", true)
      .single();

    if (accountError || !homeownerAccount) {
      return NextResponse.json(
        { error: "Invalid portal key" },
        { status: 401 }
      );
    }

    // If sender is PM, validate user authentication
    let sender_id: string | null = null;
    if (sender_type === "pm") {
      // For PM messages, we'd typically validate auth token
      // For now, we'll allow it if sender_id is provided
      sender_id = body.sender_id || null;
    }

    // Create message
    const { data: message, error: messageError } = await supabase
      .from("homeowner_messages")
      .insert({
        job_id: homeownerAccount.job_id,
        homeowner_id: homeownerAccount.id,
        sender_type,
        sender_id,
        message_text,
        is_read: sender_type === "homeowner" ? false : true, // PM messages are auto-read
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating message:", messageError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // TODO: Send notification to PM if message is from homeowner
    // This would integrate with notification system

    return NextResponse.json({
      ok: true,
      message,
    });
  } catch (error: any) {
    console.error("Error in homeowner message API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























