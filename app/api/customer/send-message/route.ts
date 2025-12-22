// Block 252300 — SmartSend Customer Communication Engine v1
// POST /api/customer/send-message
// Send automated customer messages (SMS/Email)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { job_id, customer_id, event_type, template_body, channel = 'sms', metadata = {} } = body;

    if (!job_id || !event_type) {
      return NextResponse.json(
        { error: "job_id and event_type are required" },
        { status: 400 }
      );
    }

    // Get job and customer info
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id, homeowner_name, homeowner_phone, homeowner_email, contact_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Determine recipient info
    const recipient_phone = job.homeowner_phone || null;
    const recipient_email = job.homeowner_email || null;
    const customer_id_final = customer_id || job.contact_id || null;

    // Use provided template_body or fetch from template
    let message_body = template_body;
    if (!message_body) {
      // Fetch template
      const { data: template } = await supabase
        .from("message_templates")
        .select("template")
        .eq("event_type", event_type)
        .eq("is_active", true)
        .or(`company_id.eq.${job.company_id},company_id.is.null`)
        .order("company_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      if (template) {
        message_body = template.template;
        // TODO: Replace template variables with actual values
        // For now, use template as-is
      } else {
        return NextResponse.json(
          { error: `No template found for event_type: ${event_type}` },
          { status: 404 }
        );
      }
    }

    // TODO → Integrate Twilio, Plivo, or SendGrid SMS
    // For now, simulate sending:
    console.log("SENDING MESSAGE:", {
      job_id,
      customer_id: customer_id_final,
      event_type,
      channel,
      recipient_phone,
      recipient_email,
      message_body,
    });

    // Create communication event record
    const { data: event, error: insertError } = await supabase
      .from("communication_events")
      .insert({
        job_id,
        customer_id: customer_id_final,
        event_type,
        message_body,
        channel,
        recipient_phone,
        recipient_email,
        status: 'sent', // In production, update after actual send
        metadata,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating communication event:", insertError);
      return NextResponse.json(
        { error: "Failed to create communication event" },
        { status: 500 }
      );
    }

    // TODO: Actually send via SMS/Email provider
    // Example Twilio integration:
    // if (channel === 'sms' && recipient_phone) {
    //   await twilioClient.messages.create({
    //     body: message_body,
    //     from: process.env.TWILIO_PHONE_NUMBER,
    //     to: recipient_phone,
    //   });
    // }

    return NextResponse.json({
      success: true,
      event_id: event.id,
      message: "Message sent successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/customer/send-message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























