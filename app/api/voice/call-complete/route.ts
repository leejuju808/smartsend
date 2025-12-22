// Block 130000 — SmartSend AI Voice Assistant — Call Completion Handler
// Processes completed call → Extracts lead info → Creates lead → Books appointment → Sends notifications

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const recordingUrl = formData.get("RecordingUrl") as string;
    const transcriptionText = formData.get("TranscriptionText") as string;
    const callDuration = formData.get("CallDuration") as string;

    if (!callSid) {
      return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
    }

    // Get call log with transcript
    const { data: callLog } = await supabase
      .from("call_logs")
      .select("*")
      .eq("twilio_call_sid", callSid)
      .single();

    if (!callLog) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    // Combine transcript from conversation + final transcription
    const fullTranscript = callLog.transcript
      ? `${callLog.transcript}\n${transcriptionText || ""}`
      : transcriptionText || "";

    // Extract structured lead information
    const extractedData = await extractLeadInfo(fullTranscript);

    // Create lead in database
    const leadData: any = {
      source: "phone",
      phone: callLog.from_number,
      first_name: extractedData.name?.split(" ")[0] || null,
      last_name: extractedData.name?.split(" ").slice(1).join(" ") || null,
      address: extractedData.address || null,
      custom: {
        issue: extractedData.issue,
        urgency: extractedData.urgency,
        insurance: extractedData.insurance,
        preferred_time: extractedData.preferredTime,
        call_transcript: fullTranscript,
      },
    };

    // Add user_id or workspace_id based on schema
    if (callLog.user_id) {
      leadData.user_id = callLog.user_id;
    }
    if (callLog.workspace_id) {
      leadData.workspace_id = callLog.workspace_id;
    }

    // Generate placeholder email if not provided
    if (!leadData.email) {
      leadData.email = `phone-${callLog.from_number?.replace(/\D/g, "")}@smartsend.ai`;
    }

    // Set heat score based on urgency
    if (extractedData.urgency === "urgent") {
      leadData.heat_score = "hot";
    } else if (extractedData.urgency === "normal") {
      leadData.heat_score = "warm";
    } else {
      leadData.heat_score = "warm";
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert(leadData)
      .select()
      .single();

    if (leadError) {
      console.error("Error creating lead:", leadError);
      return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
    }

    // Update call log with lead_id and final transcript
    await supabase
      .from("call_logs")
      .update({
        transcript: fullTranscript,
        call_status: "completed",
        duration_seconds: callDuration ? parseInt(callDuration) : null,
        twilio_recording_url: recordingUrl || null,
        lead_id: lead.id,
        captured_name: extractedData.name,
        captured_address: extractedData.address,
        captured_issue: extractedData.issue,
      })
      .eq("twilio_call_sid", callSid);

    // Auto-book appointment if preferred time was mentioned and user_id exists
    if (extractedData.preferredTime && callLog.user_id) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const autoBookResponse = await fetch(
          `${supabaseUrl}/functions/v1/autoBookAppointment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseAnonKey}`,
              apikey: supabaseAnonKey || "",
            },
            body: JSON.stringify({
              user_id: callLog.user_id,
              message: fullTranscript,
              lead_id: lead.id,
              homeowner_name: extractedData.name,
              address: extractedData.address,
              homeowner_phone: callLog.from_number,
            }),
          }
        );

        const autoBookResult = await autoBookResponse.json();

        if (autoBookResult.booked && autoBookResult.appointment) {
          // Send push notification to roofer
          await sendPushNotification(
            callLog.user_id,
            callLog.workspace_id,
            lead.id,
            extractedData.name,
            extractedData.address,
            autoBookResult.appointment
          );

          // Send SMS confirmation to homeowner
          if (callLog.from_number) {
            await sendSMSConfirmation(
              callLog.from_number,
              extractedData.name,
              autoBookResult.appointment
            );
          }
        }
      } catch (error) {
        console.error("Error auto-booking appointment:", error);
      }
    }

    return NextResponse.json({ success: true, lead_id: lead.id });
  } catch (error) {
    console.error("Error in call complete handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Extract structured lead information from transcript
async function extractLeadInfo(transcript: string) {
  const { parseCallTranscript } = await import("@/lib/voice/parseCallTranscript");
  return parseCallTranscript(transcript);
}

// Send push notification to roofer
async function sendPushNotification(
  userId: string | null,
  workspaceId: string | null,
  leadId: string,
  homeownerName: string | null,
  address: string | null,
  appointment: any
) {
  try {
    if (!workspaceId) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://smartsend.ai";
    await fetch(`${baseUrl}/api/mobile/push/hot-lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        lead_id: leadId,
        message: `📞 New Call → HOT Lead Booked\n${homeownerName || "Homeowner"}, ${address || ""}\nAppointment: ${appointment.date} ${appointment.time}`,
      }),
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}

// Send SMS confirmation to homeowner
async function sendSMSConfirmation(
  phoneNumber: string,
  homeownerName: string | null,
  appointment: any
) {
  try {
    const { sendSMS } = await import("@/lib/providers/sms");
    const name = homeownerName || "there";
    const date = appointment.date;
    const time = appointment.time;

    await sendSMS(
      phoneNumber,
      `Thanks for calling! Your roofing estimate is scheduled for ${date} at ${time}. We look forward to helping you.`
    );
  } catch (error) {
    console.error("Error sending SMS confirmation:", error);
  }
}


























