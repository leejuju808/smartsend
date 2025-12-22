// Block 235000 — SmartSend AI Voice & Call Engine v1
// Main inbound call webhook handler with routing, AI answering, and lead qualification

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";
import { processCallTranscription, generateCallSummary, extractCallIntent } from "@/lib/ai-call-engine";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Twilio TwiML response builders
function generateTwiMLForAI(greeting: string, gatherUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${greeting}</Say>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="10" enhanced="true">
    <Say voice="alice">Please tell me about your roofing issue.</Say>
  </Gather>
  <Say voice="alice">I didn't catch that. Let me connect you with our team.</Say>
  <Dial action="${process.env.NEXT_PUBLIC_APP_URL}/api/calls/call-status" timeout="30">
    <Number>+1234567890</Number>
  </Dial>
</Response>`;
}

function generateTwiMLForForwarding(forwardNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${process.env.NEXT_PUBLIC_APP_URL}/api/calls/call-status" timeout="30">
    <Number>${forwardNumber}</Number>
  </Dial>
</Response>`;
}

function generateTwiMLForVoicemail(voicemailUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please leave a message after the tone.</Say>
  <Record maxLength="120" action="${voicemailUrl}" transcribe="true" transcribeCallback="${voicemailUrl}" recordingStatusCallback="${voicemailUrl}" />
</Response>`;
}

function generateTwiMLForStatus(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
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
    const digits = formData.get("Digits") as string;
    const speechResult = formData.get("SpeechResult") as string;
    const recordingUrl = formData.get("RecordingUrl") as string;
    const recordingSid = formData.get("RecordingSid") as string;
    const transcriptionText = formData.get("TranscriptionText") as string;
    const transcriptionStatus = formData.get("TranscriptionStatus") as string;
    const callDuration = formData.get("CallDuration") as string;
    const dialCallStatus = formData.get("DialCallStatus") as string;

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
      return new NextResponse(generateTwiMLForStatus(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
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
      .maybeSingle();

    // Normalize phone numbers
    const normalizedFrom = normalizePhoneNumber(from);
    const normalizedTo = normalizePhoneNumber(to);

    if (!normalizedFrom || !normalizedTo) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Check if this is a new incoming call (status: ringing, queued)
    if (callStatus === "ringing" || callStatus === "queued") {
      // Evaluate routing rules
      const { data: routingResult } = await supabase.rpc("evaluate_call_routing", {
        p_company_id: companyId,
        p_org_id: orgId,
        p_workspace_id: workspaceId,
        p_from_number: normalizedFrom,
        p_transcript: null,
        p_is_after_hours: false,
        p_is_storm_mode: false,
      });

      // Check if after hours
      const { data: isAfterHours } = await supabase.rpc("is_after_hours", {
        p_company_id: companyId,
        p_org_id: orgId,
        p_workspace_id: workspaceId,
      });

      // Check storm mode
      const { data: isStormMode } = await supabase.rpc("check_storm_mode", {
        p_company_id: companyId,
        p_org_id: orgId,
        p_workspace_id: workspaceId,
      });

      // Re-evaluate routing with after-hours/storm info if no rule matched
      let routingRule = routingResult?.[0];
      if (!routingRule) {
        const { data: routingResult2 } = await supabase.rpc("evaluate_call_routing", {
          p_company_id: companyId,
          p_org_id: orgId,
          p_workspace_id: workspaceId,
          p_from_number: normalizedFrom,
          p_transcript: null,
          p_is_after_hours: isAfterHours || false,
          p_is_storm_mode: isStormMode || false,
        });
        routingRule = routingResult2?.[0];
      }

      // Determine action based on routing rule or settings
      let actionType = "forward"; // default
      let actionConfig: any = {};

      if (routingRule) {
        actionType = routingRule.action?.route_to || "forward";
        actionConfig = routingRule.action;
      } else if (phoneNumber.ai_assistant_enabled && aiSettings) {
        // Use AI assistant if enabled
        actionType = "ai_assistant";
      } else if (phoneNumber.call_forwarding_number) {
        // Forward to configured number
        actionType = "forward";
        actionConfig = { phone_number: phoneNumber.call_forwarding_number };
      }

      // Execute routing action
      if (actionType === "ai_assistant" || (routingRule && routingRule.action?.route_to === "ai_assistant")) {
        const greeting = isStormMode
          ? aiSettings?.storm_mode_message || aiSettings?.greeting || "Thanks for calling! How can we help with your roof?"
          : isAfterHours
          ? aiSettings?.after_hours_message || aiSettings?.greeting || "We're closed, but I can still help. What's your roofing issue?"
          : aiSettings?.greeting || "Thanks for calling! How can we help with your roof?";

        const gatherUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/ai-gather?callSid=${callSid}`;
        return new NextResponse(generateTwiMLForAI(greeting, gatherUrl), {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      } else if (actionType === "forward" || actionConfig.phone_number) {
        const forwardNumber = actionConfig.phone_number || phoneNumber.call_forwarding_number;
        return new NextResponse(generateTwiMLForForwarding(forwardNumber), {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      } else if (actionType === "voicemail") {
        const voicemailUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/voicemail?callSid=${callSid}`;
        return new NextResponse(generateTwiMLForVoicemail(voicemailUrl), {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      }
    }

    // Handle call completion, status updates, transcriptions
    if (callStatus === "completed" || callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed") {
      await handleCallCompletion({
        callSid,
        from: normalizedFrom,
        to: normalizedTo,
        callStatus,
        duration: callDuration ? parseInt(callDuration) : 0,
        recordingUrl,
        recordingSid,
        transcriptionText,
        companyId,
        orgId,
        workspaceId,
        routingRuleId: null, // Will be updated if we can find it
      });
    }

    // Handle AI speech input
    if (speechResult) {
      await handleAISpeechInput({
        callSid,
        speechResult,
        from: normalizedFrom,
        to: normalizedTo,
        companyId,
        orgId,
        workspaceId,
      });
    }

    // Return TwiML response
    return new NextResponse(generateTwiMLForStatus(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error in inbound call webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Handle call completion - log call, process transcript, send missed call text
async function handleCallCompletion(params: {
  callSid: string;
  from: string;
  to: string;
  callStatus: string;
  duration: number;
  recordingUrl?: string;
  recordingSid?: string;
  transcriptionText?: string;
  companyId?: string;
  orgId?: string;
  workspaceId?: string;
  routingRuleId?: string | null;
}) {
  const {
    callSid,
    from,
    to,
    callStatus,
    duration,
    recordingUrl,
    recordingSid,
    transcriptionText,
    companyId,
    orgId,
    workspaceId,
    routingRuleId,
  } = params;

  const isMissed = duration <= 5 || callStatus === "no-answer" || callStatus === "busy";
  const isVoicemail = !!recordingUrl;

  // Determine final call status
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

  // Check for existing call log
  const { data: existingCall } = await supabase
    .from("call_logs")
    .select("*")
    .eq("twilio_call_sid", callSid)
    .maybeSingle();

  // Process transcription if available
  let aiSummary = null;
  let aiIntent = "low";
  let extractedData: any = {};

  if (transcriptionText) {
    try {
      // Generate AI summary
      aiSummary = await generateCallSummary(transcriptionText);
      
      // Extract intent
      aiIntent = await extractCallIntent(transcriptionText);
      
      // Extract structured data (name, address, issue, etc.)
      extractedData = await extractCallData(transcriptionText);
    } catch (error) {
      console.error("Error processing call transcription:", error);
    }
  }

  // Create or update call log
  const callLogData: any = {
    company_id: companyId,
    org_id: orgId,
    workspace_id: workspaceId,
    from_number: from,
    to_number: to,
    call_status: finalStatus,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_seconds: duration,
    twilio_call_sid: callSid,
    twilio_recording_url: recordingUrl || null,
    twilio_recording_sid: recordingSid || null,
    transcript: transcriptionText || null,
    ai_summary: aiSummary,
    ai_intent: aiIntent,
    routing_rule_id: routingRuleId,
    routed_to: null, // Will be set based on routing rule
    extracted_data: extractedData,
  };

  if (existingCall) {
    await supabase
      .from("call_logs")
      .update(callLogData)
      .eq("id", existingCall.id);
  } else {
    const { data: callLog } = await supabase
      .from("call_logs")
      .insert(callLogData)
      .select()
      .single();

    if (callLog) {
      // Handle missed call text-back
      if (isMissed && phoneNumber?.text_back_enabled) {
        await sendMissedCallText({
          callLogId: callLog.id,
          from,
          companyId,
          orgId,
          workspaceId,
          isAfterHours: false,
          isStormMode: false,
        });
      }

      // Auto-create lead if enabled
      if (aiSettings?.auto_create_lead && (isMissed || finalStatus === "ai_answered" || isVoicemail)) {
        await autoCreateLeadFromCall({
          callLog,
          extractedData,
          companyId,
          orgId,
          workspaceId,
        });
      }
    }
  }
}

// Handle AI speech input during conversation
async function handleAISpeechInput(params: {
  callSid: string;
  speechResult: string;
  from: string;
  to: string;
  companyId?: string;
  orgId?: string;
  workspaceId?: string;
}) {
  // This would handle ongoing AI conversation
  // For now, we'll just log it - full implementation would process the speech
  // and generate appropriate responses
  console.log("AI Speech Input:", params.speechResult);
}

// Send missed call text-back
async function sendMissedCallText(params: {
  callLogId: string;
  from: string;
  companyId?: string;
  orgId?: string;
  workspaceId?: string;
  isAfterHours: boolean;
  isStormMode: boolean;
}) {
  const { callLogId, from, companyId, orgId, workspaceId, isAfterHours, isStormMode } = params;

  // Get template
  let templateType = "missed_call";
  if (isStormMode) {
    templateType = "missed_call"; // Could have storm-specific template
  } else if (isAfterHours) {
    templateType = "after_hours";
  }

  const { data: templateResult } = await supabase.rpc("get_auto_reply_template", {
    p_company_id: companyId,
    p_org_id: orgId,
    p_workspace_id: workspaceId,
    p_template_type: templateType,
    p_use_conditions: {},
  });

  let message = "Hi! Sorry we missed your call — how can we help with your roof?";
  
  if (templateResult && templateResult.length > 0) {
    message = templateResult[0].sms_body;
    // TODO: Replace template variables ({{company_name}}, etc.)
  }

  // Get SMS config
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
        accountSid: smsConfig.credentials.account_sid || smsConfig.credentials.accountSid || process.env.TWILIO_ACCOUNT_SID,
        authToken: smsConfig.credentials.auth_token || smsConfig.credentials.authToken || process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: smsConfig.phone_number,
      },
    };

    const smsResult = await sendSMS(from, message, providerConfig);

    if (smsResult.success) {
      await supabase.from("missed_call_texts").insert({
        company_id: companyId,
        org_id: orgId,
        workspace_id: workspaceId,
        call_id: callLogId,
        homeowner_number: from,
        message: message,
        status: "sent",
        twilio_message_sid: smsResult.messageId || null,
      });
    }
  }
}

// Auto-create lead from call
async function autoCreateLeadFromCall(params: {
  callLog: any;
  extractedData: any;
  companyId?: string;
  orgId?: string;
  workspaceId?: string;
}) {
  const { callLog, extractedData, companyId, orgId, workspaceId } = params;

  // Check if lead already exists
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("phone", callLog.from_number)
    .or(`workspace_id.eq.${workspaceId},org_id.eq.${orgId}`)
    .maybeSingle();

  if (existingLead) {
    // Link call to existing lead
    await supabase
      .from("call_logs")
      .update({ lead_id: existingLead.id })
      .eq("id", callLog.id);
    return;
  }

  // Create new lead
  const leadData: any = {
    workspace_id: workspaceId,
    org_id: orgId,
    phone: callLog.from_number,
    first_name: extractedData.name?.split(" ")[0] || null,
    last_name: extractedData.name?.split(" ").slice(1).join(" ") || null,
    source: "phone_call",
    status: "new",
    notes: callLog.ai_summary || `Call from ${callLog.from_number}`,
    roofing_company_id: companyId,
  };

  const { data: newLead } = await supabase
    .from("leads")
    .insert(leadData)
    .select()
    .single();

  if (newLead) {
    await supabase
      .from("call_logs")
      .update({ lead_id: newLead.id })
      .eq("id", callLog.id);
  }
}

// Extract structured data from call transcript
async function extractCallData(transcript: string): Promise<any> {
  // This would use AI to extract name, address, issue, etc.
  // For now, return empty object - will be implemented with AI service
  return {};
}

























