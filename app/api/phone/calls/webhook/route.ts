// Block 87000 — SmartSend Phone Assistant Call Webhook Handler
// Handles incoming call webhooks from Twilio
// Routes calls to AI assistant or forwarding, logs calls, sends text-backs

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Twilio TwiML response for AI answering
function generateTwiMLForAI(greeting: string, webhookUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${greeting}</Say>
  <Gather input="speech" action="${webhookUrl}" method="POST" speechTimeout="auto" timeout="10">
    <Say voice="alice">Please tell me about your roofing issue.</Say>
  </Gather>
  <Say voice="alice">I didn't catch that. Let me connect you with our team.</Say>
  <Dial>+1234567890</Dial>
</Response>`;
}

// Twilio TwiML response for forwarding
function generateTwiMLForForwarding(forwardNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${forwardNumber}</Dial>
</Response>`;
}

// Twilio TwiML response for voicemail
function generateTwiMLForVoicemail(voicemailUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please leave a message after the tone.</Say>
  <Record maxLength="120" action="${voicemailUrl}" transcribe="true" transcribeCallback="${voicemailUrl}" />
</Response>`;
}

export async function POST(req: NextRequest) {
  try {
    // Parse Twilio webhook form data
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const callStatus = formData.get("CallStatus") as string;
    const callDirection = formData.get("Direction") as string;
    const digits = formData.get("Digits") as string; // For DTMF input
    const speechResult = formData.get("SpeechResult") as string; // For speech input
    const recordingUrl = formData.get("RecordingUrl") as string;
    const recordingSid = formData.get("RecordingSid") as string;
    const transcriptionText = formData.get("TranscriptionText") as string;
    const transcriptionStatus = formData.get("TranscriptionStatus") as string;
    const callDuration = formData.get("CallDuration") as string;

    if (!callSid || !from || !to) {
      return NextResponse.json(
        { error: "Missing required fields: CallSid, From, To" },
        { status: 400 }
      );
    }

    // Find phone number configuration
    const { data: phoneNumber } = await supabase
      .from("phone_numbers")
      .select("*, roofing_companies(*), organizations(*), workspaces(*)")
      .eq("number", to)
      .eq("is_active", true)
      .single();

    if (!phoneNumber) {
      console.error(`Phone number not found: ${to}`);
      return new NextResponse(
        generateTwiMLForForwarding("+1234567890"), // Fallback
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    const companyId = phoneNumber.company_id;
    const orgId = phoneNumber.org_id;
    const workspaceId = phoneNumber.workspace_id;

    // Get AI phone settings
    const { data: aiSettings } = await supabase
      .from("ai_phone_settings")
      .select("*")
      .or(
        `company_id.eq.${companyId},org_id.eq.${orgId},workspace_id.eq.${workspaceId}`
      )
      .single();

    // Normalize phone numbers
    const normalizedFrom = normalizePhoneNumber(from);
    const normalizedTo = normalizePhoneNumber(to);

    if (!normalizedFrom || !normalizedTo) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Handle different call statuses
    if (callStatus === "ringing" || callStatus === "in-progress") {
      // Initial call - decide to answer with AI or forward
      if (phoneNumber.ai_assistant_enabled && aiSettings) {
        // Check if after hours
        const { data: isAfterHours } = await supabase.rpc("is_after_hours", {
          p_company_id: companyId,
          p_org_id: orgId,
          p_workspace_id: workspaceId,
        });

        const greeting = isAfterHours
          ? aiSettings.after_hours_message || aiSettings.greeting
          : aiSettings.greeting;

        // Check storm mode
        const { data: isStormMode } = await supabase.rpc("check_storm_mode", {
          p_company_id: companyId,
          p_org_id: orgId,
          p_workspace_id: workspaceId,
        });

        const finalGreeting = isStormMode
          ? aiSettings.storm_mode_message || greeting
          : greeting;

        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/phone/calls/ai-handler`;
        return new NextResponse(generateTwiMLForAI(finalGreeting, webhookUrl), {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      } else if (phoneNumber.call_forwarding_number) {
        // Forward to configured number
        return new NextResponse(
          generateTwiMLForForwarding(phoneNumber.call_forwarding_number),
          {
            status: 200,
            headers: { "Content-Type": "text/xml" },
          }
        );
      }
    }

    // Handle completed calls (missed, answered, voicemail)
    if (callStatus === "completed" || callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed") {
      const duration = callDuration ? parseInt(callDuration) : 0;
      const isMissed = duration <= 5 || callStatus === "no-answer" || callStatus === "busy";
      const isVoicemail = recordingUrl && recordingSid;

      // Determine call status
      let finalStatus: "answered" | "missed" | "voicemail" | "ai_answered" | "busy" | "failed" | "no_answer";
      if (isVoicemail) {
        finalStatus = "voicemail";
      } else if (isMissed) {
        finalStatus = "missed";
      } else if (callStatus === "busy") {
        finalStatus = "busy";
      } else if (callStatus === "failed") {
        finalStatus = "failed";
      } else {
        finalStatus = "answered";
      }

      // Create call log
      const { data: callLog, error: callLogError } = await supabase
        .from("call_logs")
        .insert({
          company_id: companyId,
          org_id: orgId,
          workspace_id: workspaceId,
          from_number: normalizedFrom,
          to_number: normalizedTo,
          call_status: finalStatus,
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          twilio_call_sid: callSid,
          twilio_recording_url: recordingUrl || null,
          twilio_recording_sid: recordingSid || null,
          transcript: transcriptionText || null,
        })
        .select()
        .single();

      if (callLogError) {
        console.error("Error creating call log:", callLogError);
      }

      // Process transcription and create AI summary if available
      if (transcriptionText && callLog) {
        // Classify intent
        const { data: intent } = await supabase.rpc("classify_call_intent", {
          p_transcript: transcriptionText,
          p_high_intent_keywords: aiSettings?.high_intent_keywords || [
            "leak",
            "emergency",
            "urgent",
            "storm",
            "damage",
            "water",
            "now",
            "today",
          ],
          p_medium_intent_keywords: aiSettings?.medium_intent_keywords || [
            "estimate",
            "quote",
            "inspection",
            "repair",
            "replace",
          ],
        });

        // Generate AI summary (simplified - in production, use OpenAI)
        const aiSummary = `Call from ${normalizedFrom}. ${transcriptionText.substring(0, 200)}...`;

        // Update call log with AI processing
        await supabase
          .from("call_logs")
          .update({
            ai_summary: aiSummary,
            ai_intent: intent || "low",
            ai_urgency: intent === "high" ? "urgent" : "normal",
          })
          .eq("id", callLog.id);
      }

      // Handle missed call text-back
      if (isMissed && phoneNumber.text_back_enabled && callLog) {
        try {
          // Get company name
          let companyName = "SmartSend";
          if (phoneNumber.roofing_companies) {
            companyName = phoneNumber.roofing_companies.name;
          } else if (phoneNumber.organizations) {
            companyName = phoneNumber.organizations.name || "SmartSend";
          }

          // Build text message
          const isAfterHours = await supabase.rpc("is_after_hours", {
            p_company_id: companyId,
            p_org_id: orgId,
            p_workspace_id: workspaceId,
          });

          const isStormMode = await supabase.rpc("check_storm_mode", {
            p_company_id: companyId,
            p_org_id: orgId,
            p_workspace_id: workspaceId,
          });

          let message = `Hi! This is ${companyName}. Sorry we missed your call — how can we help with your roof?`;

          if (isAfterHours.data) {
            message =
              aiSettings?.after_hours_message ||
              `We're closed right now, but I can still get you scheduled for an inspection. What happened to your roof?`;
          } else if (isStormMode.data) {
            message =
              aiSettings?.storm_mode_message ||
              `We're currently helping many homeowners after last night's storm. We can get you scheduled for an inspection today or tomorrow — what works best?`;
          }

          // Get SMS config from workspace settings
          const { data: workspaceSettings } = await supabase
            .from("workspace_settings")
            .select("settings")
            .eq("workspace_id", workspaceId)
            .single();

          const smsConfig = workspaceSettings?.settings?.sms;
          if (smsConfig?.phone_number && smsConfig?.credentials) {
            const providerConfig = {
              provider: (smsConfig.provider || "twilio") as "twilio" | "nexmo" | "telnyx",
              credentials: {
                accountSid:
                  smsConfig.credentials.account_sid ||
                  smsConfig.credentials.accountSid ||
                  process.env.TWILIO_ACCOUNT_SID,
                authToken:
                  smsConfig.credentials.auth_token ||
                  smsConfig.credentials.authToken ||
                  process.env.TWILIO_AUTH_TOKEN,
                phoneNumber: smsConfig.phone_number,
              },
            };

            const smsResult = await sendSMS(normalizedFrom, message, providerConfig);

            if (smsResult.success) {
              // Log text-back
              await supabase.from("missed_call_texts").insert({
                company_id: companyId,
                org_id: orgId,
                workspace_id: workspaceId,
                call_id: callLog.id,
                homeowner_number: normalizedFrom,
                message: message,
                status: "sent",
                twilio_message_sid: smsResult.messageId || null,
              });
            }
          }
        } catch (smsError) {
          console.error("Error sending missed call text-back:", smsError);
        }
      }

      // Auto-create lead if enabled
      if (callLog && aiSettings) {
        const shouldCreateLead =
          (isMissed && aiSettings.auto_create_lead_on_missed) ||
          (finalStatus === "ai_answered" &&
            aiSettings.auto_create_lead_on_ai_answered) ||
          (isVoicemail && aiSettings.auto_create_lead_on_voicemail);

        if (shouldCreateLead) {
          try {
            // Check if lead already exists for this phone number
            const { data: existingLead } = await supabase
              .from("leads")
              .select("id")
              .eq("phone", normalizedFrom)
              .or(
                `workspace_id.eq.${workspaceId},org_id.eq.${orgId}`
              )
              .single();

            if (!existingLead) {
              // Create new lead
              const { data: newLead } = await supabase
                .from("leads")
                .insert({
                  workspace_id: workspaceId,
                  phone: normalizedFrom,
                  source: "phone_call",
                  status: "new",
                  notes: callLog.ai_summary || `Call from ${normalizedFrom}`,
                })
                .select()
                .single();

              if (newLead) {
                // Link call to lead
                await supabase
                  .from("call_logs")
                  .update({ lead_id: newLead.id })
                  .eq("id", callLog.id);
              }
            } else {
              // Link call to existing lead
              await supabase
                .from("call_logs")
                .update({ lead_id: existingLead.id })
                .eq("id", callLog.id);
            }
          } catch (leadError) {
            console.error("Error creating lead from call:", leadError);
          }
        }
      }
    }

    // Return empty TwiML for status callbacks
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Error in call webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



























