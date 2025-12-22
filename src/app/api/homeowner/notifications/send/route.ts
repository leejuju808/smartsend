// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Send notification to homeowner
// Sends SMS/email for: crew arrival, material delivery, milestones, delays, etc.

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
    const {
      job_id,
      homeowner_id,
      type,
      message,
      sent_via = "both", // 'sms', 'email', or 'both'
    } = body;

    if (!job_id || !type || !message) {
      return NextResponse.json(
        { error: "job_id, type, and message are required" },
        { status: 400 }
      );
    }

    // Get homeowner info if not provided
    let homeowner: any = null;
    if (homeowner_id) {
      const { data } = await supabase
        .from("homeowners")
        .select("id, email, name")
        .eq("id", homeowner_id)
        .single();
      homeowner = data;
    } else {
      // Get first homeowner for job
      const { data } = await supabase
        .from("homeowners")
        .select("id, email, name")
        .eq("job_id", job_id)
        .limit(1)
        .single();
      homeowner = data;
    }

    if (!homeowner) {
      return NextResponse.json(
        { error: "Homeowner not found for this job" },
        { status: 404 }
      );
    }

    // Insert notification record
    const { data: notification, error: notifError } = await supabase
      .from("homeowner_notifications")
      .insert({
        job_id,
        homeowner_id: homeowner.id,
        type,
        message,
        sent_via,
      })
      .select()
      .single();

    if (notifError) {
      console.error("Error creating notification:", notifError);
      return NextResponse.json(
        { error: "Failed to create notification" },
        { status: 500 }
      );
    }

    // Send actual SMS/Email via your notification service
    // This is a placeholder - integrate with your SMS/email service
    if (sent_via === "sms" || sent_via === "both") {
      // TODO: Integrate with Twilio/Vonage/etc.
      // await sendSMS(homeowner.phone, message);
    }

    if (sent_via === "email" || sent_via === "both") {
      // TODO: Integrate with your email service (Resend, SendGrid, etc.)
      // await sendEmail(homeowner.email, 'Job Update', message);
    }

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error: any) {
    console.error("Error in send notification:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























