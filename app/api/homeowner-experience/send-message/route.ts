// Block 25140 — SmartSend Roofing Homeowner Experience v1
// API endpoint for homeowners to send messages via portal

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
    const { portal_token, message } = body;

    if (!portal_token || !message) {
      return NextResponse.json(
        { error: "portal_token and message are required" },
        { status: 400 }
      );
    }

    // Validate portal token and get job/contact info
    const { data: portal } = await supabase
      .from("homeowner_portals")
      .select("id, job_id, workspace_id")
      .eq("portal_token", portal_token)
      .eq("is_enabled", true)
      .single();

    if (!portal) {
      return NextResponse.json(
        { error: "Invalid portal token" },
        { status: 404 }
      );
    }

    // Get job and contact info
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("contact_id, lead_id, homeowner_name, homeowner_email")
      .eq("id", portal.job_id)
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get contact email
    let contactEmail = job.homeowner_email;
    if (job.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("email")
        .eq("id", job.contact_id)
        .single();
      
      if (contact?.email) {
        contactEmail = contact.email;
      }
    }

    if (!contactEmail) {
      return NextResponse.json(
        { error: "Contact email not found" },
        { status: 400 }
      );
    }

    // Create message in unified_messages table
    const { data: newMessage, error: messageError } = await supabase
      .from("unified_messages")
      .insert({
        workspace_id: portal.workspace_id,
        job_id: portal.job_id,
        lead_id: job.lead_id || null,
        contact_id: job.contact_id || null,
        channel: "webform",
        direction: "inbound",
        from_address: contactEmail,
        to_address: null, // Will be set by workspace default
        subject: "Message from Homeowner Portal",
        body_text: message,
        status: "delivered",
        ai_intent: "question",
        ai_priority: "normal",
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

    // Create portal timeline event
    await supabase.from("homeowner_portal_timeline_events").insert({
      workspace_id: portal.workspace_id,
      job_id: portal.job_id,
      portal_id: portal.id,
      event_type: "update_posted",
      event_title: "Message Sent",
      event_description: "Homeowner sent a message via portal",
      event_date: new Date().toISOString(),
      icon_name: "message-square",
      color: "blue",
    });

    return NextResponse.json({
      success: true,
      message_id: newMessage.id,
    });
  } catch (error: any) {
    console.error("Error sending homeowner message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

