// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Send message from homeowner to office
// Homeowner → company inbox, notifies assigned PM

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
    const { token, message, job_id } = body;

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    let homeowner_id: string | null = null;
    let final_job_id: string | null = job_id || null;

    // Validate token if provided (for homeowner portal)
    if (token) {
      const { data: session, error: sessionError } = await supabase
        .from("homeowner_sessions")
        .select("*, homeowners(id, job_id)")
        .eq("token", token)
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "Token has expired" },
          { status: 401 }
        );
      }

      const homeowner = (session as any).homeowners;
      homeowner_id = homeowner?.id || null;
      final_job_id = homeowner?.job_id || final_job_id;
    }

    if (!final_job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Insert message
    const { data: newMessage, error: messageError } = await supabase
      .from("homeowner_messages")
      .insert({
        job_id: final_job_id,
        sender: "homeowner",
        message: message.trim(),
        homeowner_id,
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

    // TODO: Notify assigned PM or office staff
    // This could integrate with your notification system
    // - Send email to assigned PM
    // - Create task for office
    // - Send Slack/Discord notification

    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error("Error in chat send:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























