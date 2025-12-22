// Block 130000 — SmartSend AI Voice Assistant — Inbound Call Handler
// Receives Twilio call webhook → Initiates AI conversation using Twilio Gather + OpenAI

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    // Parse Twilio webhook form data
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const fromNumber = formData.get("From") as string;
    const toNumber = formData.get("To") as string;
    const callStatus = formData.get("CallStatus") as string;
    const speechResult = formData.get("SpeechResult") as string;
    const digits = formData.get("Digits") as string;

    if (!callSid || !fromNumber || !toNumber) {
      return NextResponse.json(
        { error: "Missing required fields: CallSid, From, To" },
        { status: 400 }
      );
    }

    // Find phone number configuration to get user_id/workspace_id
    const { data: phoneNumber } = await supabase
      .from("phone_numbers")
      .select("*, roofing_companies(*), organizations(*), workspaces(*)")
      .eq("number", toNumber)
      .eq("is_active", true)
      .single();

    if (!phoneNumber) {
      console.error(`Phone number not found: ${toNumber}`);
      // Return basic TwiML to forward call
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Please hold while we connect you.</Say>
  <Dial>+1234567890</Dial>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    // Extract user/workspace info
    const userId = phoneNumber.user_id || phoneNumber.workspaces?.user_id;
    const workspaceId = phoneNumber.workspace_id;
    const companyId = phoneNumber.company_id;

    // Get or create call session
    let callSession = await getOrCreateCallSession(callSid, {
      fromNumber,
      toNumber,
      userId,
      workspaceId,
      companyId,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://smartsend.ai";
    const handlerUrl = `${baseUrl}/api/voice/inbound`;

    // If we have speech input, process it with AI
    if (speechResult && callSession) {
      const aiResponse = await processSpeechInput(
        speechResult,
        callSession.transcript || "",
        callSession.conversationState || "greeting"
      );

      // Update call session
      await supabase
        .from("call_logs")
        .update({
          transcript: (callSession.transcript || "") + `\nHomeowner: ${speechResult}\nAI: ${aiResponse.text}`,
          conversation_state: aiResponse.nextState,
        })
        .eq("twilio_call_sid", callSid);

      // Check if we should book appointment
      if (aiResponse.shouldBook) {
        // Collect all info and book
        return new NextResponse(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${aiResponse.text}</Say>
  <Gather input="speech" action="${handlerUrl}" method="POST" speechTimeout="auto" timeout="10">
    <Say voice="alice">What day and time works best for you?</Say>
  </Gather>
  <Say voice="alice">Perfect! I'll have our team confirm the appointment details with you shortly. Thank you for calling!</Say>
  <Record action="${baseUrl}/api/voice/call-complete" transcribe="true" transcribeCallback="${baseUrl}/api/voice/call-complete" />
</Response>`,
          {
            status: 200,
            headers: { "Content-Type": "text/xml" },
          }
        );
      }

      // Continue conversation
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${aiResponse.text}</Say>
  <Gather input="speech" action="${handlerUrl}" method="POST" speechTimeout="auto" timeout="10" />
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    // Initial greeting
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! Thank you for calling. I'm SmartSend AI Assistant. How can I help you with your roofing needs today?</Say>
  <Gather input="speech" action="${handlerUrl}" method="POST" speechTimeout="auto" timeout="10" />
  <Say voice="alice">I didn't catch that. Let me connect you with our team.</Say>
  <Dial>+1234567890</Dial>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Error in voice inbound handler:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, I'm having trouble connecting. Let me transfer you to our team.</Say>
  <Dial>+1234567890</Dial>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}

// Get or create call session
async function getOrCreateCallSession(
  callSid: string,
  metadata: {
    fromNumber: string;
    toNumber: string;
    userId: string | null;
    workspaceId: string | null;
    companyId: string | null;
  }
) {
  // Check if call log exists
  const { data: existing } = await supabase
    .from("call_logs")
    .select("*")
    .eq("twilio_call_sid", callSid)
    .single();

  if (existing) {
    return existing;
  }

  // Create new call log
  const { data: newCall } = await supabase
    .from("call_logs")
    .insert({
      twilio_call_sid: callSid,
      from_number: metadata.fromNumber,
      to_number: metadata.toNumber,
      call_status: "in-progress",
      call_direction: "inbound",
      company_id: metadata.companyId,
      workspace_id: metadata.workspaceId,
      user_id: metadata.userId,
      ai_assistant_enabled: true,
      conversation_state: "greeting",
      transcript: "",
    })
    .select()
    .single();

  return newCall;
}

// Process speech input with OpenAI
async function processSpeechInput(
  userInput: string,
  previousTranscript: string,
  currentState: string
): Promise<{ text: string; nextState: string; shouldBook: boolean }> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const systemPrompt = `You are SmartSend Roofing AI Assistant. You're having a phone conversation with a homeowner.

Current conversation state: ${currentState}
Previous conversation: ${previousTranscript}

Your goal:
1. Greet and ask for name (if not collected)
2. Ask for address (if not collected)
3. Ask about roof problem (if not collected)
4. Ask about urgency (if not collected)
5. Ask about insurance (if not collected)
6. If they want an estimate, offer to book appointment

Keep responses SHORT (1-2 sentences max). Be conversational and friendly.
Return JSON: { "response": "what to say", "nextState": "greeting|collecting_name|collecting_address|collecting_issue|collecting_urgency|collecting_insurance|booking", "shouldBook": true/false }`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Homeowner said: ${userInput}` },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(
      completion.choices[0].message.content || '{"response": "I understand. Can you tell me more?", "nextState": "collecting_issue", "shouldBook": false}'
    );

    return {
      text: result.response || "I understand. Can you tell me more?",
      nextState: result.nextState || currentState,
      shouldBook: result.shouldBook || false,
    };
  } catch (error) {
    console.error("Error processing speech:", error);
    return {
      text: "I understand. Can you tell me more about your roofing issue?",
      nextState: currentState,
      shouldBook: false,
    };
  }
}


























