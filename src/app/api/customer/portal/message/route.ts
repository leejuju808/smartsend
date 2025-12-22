// Block 227000 — SmartSend Roofing Customer Portal
// POST /api/customer/portal/message
// Customer sends a message (public access via token)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { token, message, sender_name, sender_email } = await req.json();

    if (!token || !message) {
      return NextResponse.json(
        { error: "Token and message are required" },
        { status: 400 }
      );
    }

    // Validate token
    const { data: access, error: accessError } = await supabase
      .from("customer_portal_access")
      .select("*, homeowner:homeowners(*), job_id")
      .eq("access_token", token)
      .eq("is_active", true)
      .single();

    if (accessError || !access) {
      return NextResponse.json(
        { error: "Invalid or expired portal access token" },
        { status: 401 }
      );
    }

    // Create message
    const { data: newMessage, error: messageError } = await supabase
      .from("customer_messages")
      .insert({
        job_id: access.job_id,
        sender_type: "homeowner",
        sender_name: sender_name || access.homeowner?.name || "Homeowner",
        sender_email: sender_email || access.homeowner?.email || null,
        message,
        homeowner_id: access.homeowner_id,
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating message:", messageError);
      return NextResponse.json(
        { error: "Failed to send message", details: messageError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error("Error in message API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























