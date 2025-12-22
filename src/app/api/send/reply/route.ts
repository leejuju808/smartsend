import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { sendMail } from "@/lib/mailer";
import { instrumentEmailHtml } from "@/lib/tracking";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  try {
    const { thread_id, body_html, subject: providedSubject } = await req.json();

    if (!thread_id || !body_html) {
      return NextResponse.json(
        { error: "Missing thread_id or body_html" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Fetch thread + lead info
    const { data: thread, error: threadError } = await supabase
      .from("email_threads")
      .select("*")
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get FROM email from env or use default
    const fromEmail = process.env.FROM_EMAIL || "reply@smartsendhq.com";
    const subject = providedSubject || `Re: ${thread.subject || ""}`;

    // Create email_log entry for tracking
    const { data: emailLog, error: logError } = await supabase
      .from("email_logs")
      .insert({
        workspace_id: thread.workspace_id,
        to_address: thread.lead_email,
        from_address: fromEmail,
        subject,
        status: "queued",
        thread_id: thread_id,
      })
      .select("id")
      .single();

    if (logError || !emailLog) {
      console.error("Failed to create email log:", logError);
      // Continue anyway, but log the error
    }

    const emailLogId = emailLog?.id;

    // Apply tracking to HTML (links + pixel)
    const trackedHtml = emailLogId
      ? instrumentEmailHtml(body_html, APP_URL, emailLogId)
      : body_html;

    // Send email via configured mail provider
    try {
      await sendMail({
        to: thread.lead_email,
        from: fromEmail,
        subject,
        html: trackedHtml,
      });

      // Update email_log status to sent
      if (emailLogId) {
        await supabase
          .from("email_logs")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", emailLogId);
      }
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      
      // Update email_log status to failed
      if (emailLogId) {
        await supabase
          .from("email_logs")
          .update({ status: "failed" })
          .eq("id", emailLogId);
      }

      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    // Insert message into thread
    const { error: insertError } = await supabase
      .from("email_messages")
      .insert({
        thread_id,
        from_address: fromEmail,
        to_address: thread.lead_email,
        subject,
        body_html: trackedHtml,
        direction: "sent",
      });

    if (insertError) {
      console.error("Failed to insert message:", insertError);
      return NextResponse.json(
        { error: "Failed to save message" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in /api/send/reply:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

