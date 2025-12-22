import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/server/supabase";

/**
 * POST /api/inbox/adjuster/send
 * Sends an adjuster email (queues it for sending via existing email infrastructure)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { adjuster_email_id, thread_id } = body;

    if (!adjuster_email_id && !thread_id) {
      return NextResponse.json(
        { error: "adjuster_email_id or thread_id is required" },
        { status: 400 }
      );
    }

    // Get adjuster email record
    let adjusterEmail;
    if (adjuster_email_id) {
      const { data, error } = await supabase
        .from("adjuster_emails")
        .select("*")
        .eq("id", adjuster_email_id)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Adjuster email not found" },
          { status: 404 }
        );
      }
      adjusterEmail = data;
    } else {
      // Get latest draft for thread
      const { data, error } = await supabase
        .from("adjuster_emails")
        .select("*")
        .eq("thread_id", thread_id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "No draft adjuster email found for this thread" },
          { status: 404 }
        );
      }
      adjusterEmail = data;
    }

    // Get thread to find workspace and mailbox
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("workspace_id, contact_id, lead_id, campaign_id")
      .eq("id", adjusterEmail.thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Block 20840: Check permission to send adjuster emails (OWNER only)
    const { data: canSend, error: permError } = await supabase.rpc(
      "can_send_adjuster_email",
      { p_thread_id: adjusterEmail.thread_id }
    );

    if (permError || !canSend) {
      return NextResponse.json(
        { error: "You don't have permission to send adjuster emails. Only owners can send adjuster emails." },
        { status: 403 }
      );
    }

    // Get connected mailbox for sending
    const { data: mailbox } = await supabaseAdmin
      .from("mailboxes")
      .select("id, email, provider, oauth")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .not("oauth", "is", null)
      .limit(1)
      .maybeSingle();

    if (!mailbox) {
      return NextResponse.json(
        { error: "No connected email account found. Please connect Gmail or Outlook." },
        { status: 400 }
      );
    }

    // Queue email via existing outbox system
    const { data: queuedEmail, error: queueError } = await supabaseAdmin
      .from("outbox")
      .insert({
        workspace_id: thread.workspace_id,
        account_id: mailbox.id,
        lead_id: thread.lead_id,
        thread_id: adjusterEmail.thread_id,
        to_email: adjusterEmail.adjuster_email,
        subject: adjusterEmail.subject,
        body_text: adjusterEmail.body_text,
        status: "queued",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (queueError) {
      console.error("Error queueing email:", queueError);
      return NextResponse.json(
        { error: "Failed to queue email for sending" },
        { status: 500 }
      );
    }

    // Update adjuster_email status to queued
    await supabase
      .from("adjuster_emails")
      .update({
        status: "queued",
        updated_at: new Date().toISOString(),
      })
      .eq("id", adjusterEmail.id);

    // Create timeline event
    try {
      await supabase.rpc("create_adjuster_contacted_event", {
        p_thread_id: adjusterEmail.thread_id,
        p_email_type: adjusterEmail.email_type,
        p_reason: adjusterEmail.trigger_reason || "manual_trigger",
      });
    } catch (e) {
      console.error("Error creating timeline event:", e);
      // Don't fail the request
    }

    return NextResponse.json({
      success: true,
      adjuster_email_id: adjusterEmail.id,
      queued_email_id: queuedEmail.id,
      message: "Email queued for sending",
    });
  } catch (error: any) {
    console.error("[Send Adjuster Email] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send adjuster email" },
      { status: 500 }
    );
  }
}

