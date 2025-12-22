// Block 200000 — SmartSend Roofing Homeowner Portal Notification Handler
// POST /api/portal/notifications/send
// Helper endpoint to send portal notifications (called by edge functions or background jobs)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { portalId, jobId, type, message, phone, email } = await req.json();

    if (!portalId || !jobId || !type || !message) {
      return NextResponse.json(
        { error: "portalId, jobId, type, and message are required" },
        { status: 400 }
      );
    }

    // Create notification record
    const { data: notification, error: notifError } = await supabase
      .from("homeowner_portal_notifications")
      .insert({
        portal_id: portalId,
        job_id: jobId,
        notification_type: type,
        message,
        sent_via_sms: !!phone,
        sent_via_email: !!email,
      })
      .select()
      .single();

    if (notifError) {
      return NextResponse.json(
        { error: "Failed to create notification record" },
        { status: 500 }
      );
    }

    // Send SMS if phone provided
    if (phone) {
      try {
        // Use existing SMS send API or Twilio directly
        const smsResponse = await fetch(`${req.nextUrl.origin}/api/inbox/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            message,
            workspace_id: (await supabase.from("homeowner_portals").select("workspace_id").eq("id", portalId).single()).data?.workspace_id,
          }),
        });

        if (smsResponse.ok) {
          const smsData = await smsResponse.json();
          await supabase
            .from("homeowner_portal_notifications")
            .update({ sms_sid: smsData.sid })
            .eq("id", notification.id);
        }
      } catch (smsError) {
        console.error("Failed to send SMS:", smsError);
        // Continue even if SMS fails
      }
    }

    // Send email if email provided
    if (email) {
      try {
        // Use existing email send API or Resend directly
        const emailResponse = await fetch(`${req.nextUrl.origin}/api/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: "SmartSend Project Update",
            body: message,
          }),
        });

        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          await supabase
            .from("homeowner_portal_notifications")
            .update({ email_id: emailData.id })
            .eq("id", notification.id);
        }
      } catch (emailError) {
        console.error("Failed to send email:", emailError);
        // Continue even if email fails
      }
    }

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error: any) {
    console.error("Notification send error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























