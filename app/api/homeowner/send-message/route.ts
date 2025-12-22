// Block 94000 — Homeowner Portal Messaging API
// API endpoint for homeowners to send messages via portal (token-based)
// Uses homeowner_messages table with portal_id

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, message } = body;

    if (!token || !message) {
      return NextResponse.json(
        { error: "token and message are required" },
        { status: 400 }
      );
    }

    // Validate portal token (Block 94000)
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id, is_active")
      .eq("portal_token", token)
      .single();

    if (portalError || !portal || !portal.is_active) {
      return NextResponse.json(
        { error: "Invalid or inactive portal token" },
        { status: 401 }
      );
    }

    // Insert message into homeowner_messages (Block 94000)
    const { data: newMessage, error: messageError } = await supabase
      .from("homeowner_messages")
      .insert({
        portal_id: portal.id,
        job_id: portal.job_id,
        direction: "incoming",
        channel: "portal",
        body: message.trim(),
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error inserting message:", messageError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error("Error in send-message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





