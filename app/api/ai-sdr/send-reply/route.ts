import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { thread_id, subject, body } = await req.json();

    if (!thread_id || !body) {
      return NextResponse.json(
        { error: "thread_id and body are required" },
        { status: 400 }
      );
    }

    // Get thread info
    const { data: thread, error: threadError } = await supabase
      .from("ai_sdr_thread_overview")
      .select("*")
      .eq("thread_id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get lead email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("email")
      .eq("id", thread.lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get user profile for sender email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    const fromEmail = profile?.email || user.email || "noreply@smartsend.ai";

    const now = new Date().toISOString();

    // Insert outbound email
    const { error: emailError, data: email } = await supabase
      .from("emails")
      .insert({
        lead_id: thread.lead_id,
        campaign_id: thread.campaign_id,
        subject: subject || "Re: Follow-up",
        body_text: body,
        body_html: body.replace(/\n/g, "<br>"),
        is_incoming: false,
        sender: fromEmail,
        to_recipients: [lead.email],
        sent_at: now,
        created_at: now,
      })
      .select("id")
      .single();

    if (emailError) {
      console.error("Error inserting email:", emailError);
      return NextResponse.json(
        { error: "Failed to save email" },
        { status: 500 }
      );
    }

    // Insert AI SDR event
    const { error: eventError } = await supabase
      .from("ai_sdr_events")
      .insert({
        thread_id: thread_id,
        event_type: "send_followup",
        details: {
          manual_reply: true,
          subject: subject || "Re: Follow-up",
          body: body,
          email_id: email.id,
        },
      });

    if (eventError) {
      console.error("Error inserting event:", eventError);
      // Don't fail the request, just log
    }

    // Update thread metadata
    const { error: updateError } = await supabase
      .from("ai_sdr_threads")
      .update({
        last_message_from: "me",
        last_message_at: now,
        status: "awaiting_reply",
        next_action_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
      })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Error updating thread:", updateError);
      // Don't fail the request, just log
    }

    // TODO: Trigger email sending pipeline (Gmail/Outlook send)
    // For now, we'll just queue it or you can call your existing send endpoint
    // You might want to insert into send_queue or call your email sending service

    return NextResponse.json({ 
      ok: true, 
      email_id: email.id,
      message: "Reply queued successfully" 
    });
  } catch (error: any) {
    console.error("Error in send-reply route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


