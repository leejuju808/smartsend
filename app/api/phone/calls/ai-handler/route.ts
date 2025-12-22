// Block 87000 — AI Phone Assistant Handler
// Handles speech input during AI-answered calls
// Captures homeowner info and books inspections

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const speechResult = formData.get("SpeechResult") as string;
    const digits = formData.get("Digits") as string;

    if (!callSid || !from || !to) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>I'm sorry, I didn't catch that. Let me connect you with our team.</Say><Dial>+1234567890</Dial></Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    // Find call log
    const { data: callLog } = await supabase
      .from("call_logs")
      .select("*, phone_numbers(*), ai_phone_settings(*)")
      .eq("twilio_call_sid", callSid)
      .single();

    if (!callLog) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Let me connect you with our team.</Say><Dial>+1234567890</Dial></Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    const aiSettings = callLog.ai_phone_settings;
    const userInput = speechResult || digits;

    if (!userInput) {
      // No input yet - ask for issue
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">What happened to your roof? Please describe the issue.</Say>
  <Gather input="speech" action="${process.env.NEXT_PUBLIC_APP_URL}/api/phone/calls/ai-handler" method="POST" speechTimeout="auto" timeout="10" />
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    // Process user input with AI (simplified - in production, use OpenAI)
    const lowerInput = userInput.toLowerCase();
    
    // Extract information
    let capturedIssue = "";
    let capturedName = "";
    let capturedAddress = "";
    let wantsInspection = false;

    // Detect issue keywords
    if (
      lowerInput.includes("leak") ||
      lowerInput.includes("water") ||
      lowerInput.includes("damage") ||
      lowerInput.includes("storm") ||
      lowerInput.includes("missing") ||
      lowerInput.includes("shingle")
    ) {
      capturedIssue = userInput;
    }

    // Detect name (simplified - in production, use NLP)
    const nameMatch = userInput.match(/my name is (\w+)/i);
    if (nameMatch) {
      capturedName = nameMatch[1];
    }

    // Detect address (simplified)
    if (lowerInput.includes("address") || lowerInput.includes("live at")) {
      // Would extract address in production
    }

    // Detect inspection request
    if (
      lowerInput.includes("inspection") ||
      lowerInput.includes("estimate") ||
      lowerInput.includes("quote") ||
      lowerInput.includes("schedule") ||
      lowerInput.includes("appointment")
    ) {
      wantsInspection = true;
    }

    // Update call log with captured info
    await supabase
      .from("call_logs")
      .update({
        transcript: (callLog.transcript || "") + "\n" + userInput,
        captured_issue: capturedIssue || callLog.captured_issue,
        captured_name: capturedName || callLog.captured_name,
        captured_address: capturedAddress || callLog.captured_address,
        inspection_booked: wantsInspection,
        call_status: "ai_answered",
      })
      .eq("id", callLog.id);

    // Generate response
    let response = "";
    if (wantsInspection) {
      response = `Great! I can help you schedule an inspection. What day works best for you?`;
    } else if (capturedIssue) {
      response = `I understand you have a ${capturedIssue.substring(0, 50)} issue. Would you like to schedule an inspection?`;
    } else {
      response = `I'd be happy to help. Can you tell me more about what's happening with your roof?`;
    }

    // If inspection requested, try to book
    if (wantsInspection) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${response}</Say>
  <Gather input="speech" action="${process.env.NEXT_PUBLIC_APP_URL}/api/phone/calls/ai-handler" method="POST" speechTimeout="auto" timeout="10" />
  <Say voice="alice">I'll have our team call you back within 15 minutes to confirm the inspection time.</Say>
  <Say voice="alice">Thank you for calling!</Say>
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
  <Say voice="alice">${response}</Say>
  <Gather input="speech" action="${process.env.NEXT_PUBLIC_APP_URL}/api/phone/calls/ai-handler" method="POST" speechTimeout="auto" timeout="10" />
  <Say voice="alice">Let me connect you with our team to help you further.</Say>
  <Dial>+1234567890</Dial>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Error in AI handler:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>I'm sorry, I'm having trouble. Let me connect you with our team.</Say><Dial>+1234567890</Dial></Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}



























