// Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
// API Route: Call Webhook Handler
// Handles incoming call webhooks from Twilio/Vonage and routes to missed-call-handler

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseFunctionsUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(
  ".supabase.co",
  ".functions.supabase.co"
);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    // Support both form data (Twilio) and JSON (Vonage)
    let body: any;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Twilio sends form data
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      // Vonage/JSON format
      body = await req.json();
    }

    // Detect provider
    const provider = body.provider || req.headers.get("x-provider") || detectProvider(body);

    // Extract call information based on provider
    let callSid: string;
    let fromPhone: string;
    let toPhone: string;
    let callStatus: string;
    let callDuration: string | null = null;
    let voicemailUrl: string | null = null;
    let answeredAt: string | null = null;

    if (provider === "twilio") {
      // Twilio webhook format
      callSid = body.CallSid || body.CallSid || "";
      fromPhone = body.From || body.from || "";
      toPhone = body.To || body.to || "";
      callStatus = body.CallStatus || body.CallStatus || "";
      callDuration = body.CallDuration || null;
      voicemailUrl = body.RecordingUrl || body.VoicemailUrl || null;
      
      // Twilio status values: queued, ringing, in-progress, completed, busy, failed, no-answer
      if (callStatus === "completed" && body.AnsweredBy) {
        answeredAt = new Date().toISOString();
      }
    } else if (provider === "vonage" || provider === "nexmo") {
      // Vonage/Nexmo webhook format
      callSid = body.uuid || body.conversation_uuid || "";
      fromPhone = body.from || body.number || "";
      toPhone = body.to || body.to_number || "";
      callStatus = body.status || body.call_status || "";
      callDuration = body.duration || null;
      voicemailUrl = body.recording_url || null;
    } else {
      // Generic format
      callSid = body.call_sid || body.call_id || body.uuid || "";
      fromPhone = body.from || body.from_number || "";
      toPhone = body.to || body.to_number || "";
      callStatus = body.status || body.call_status || "";
      callDuration = body.duration || null;
      voicemailUrl = body.voicemail_url || body.recording_url || null;
    }

    if (!callSid || !fromPhone || !toPhone) {
      return NextResponse.json(
        { error: "Missing required fields: call_sid, from, to" },
        { status: 400 }
      );
    }

    // Get contractor/workspace info from phone number or configuration
    // In production, you'd map the toPhone to a contractor/workspace
    const { data: workspaceConfig } = await supabase
      .from("workspace_settings")
      .select("workspace_id, settings")
      .contains("settings", { sms: { phone_number: toPhone } })
      .maybeSingle();

    let workspaceId: string | null = null;
    let contractorId: string | null = null;

    if (workspaceConfig) {
      workspaceId = workspaceConfig.workspace_id;
      // Get contractor_id from workspace owner
      const { data: owner } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();

      if (owner) {
        contractorId = owner.user_id;
      }
    }

    // Determine event type
    let eventType: "incoming" | "missed" | "voicemail" | "completed" | "answered" = "incoming";

    if (callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed") {
      eventType = "missed";
    } else if (callStatus === "completed") {
      if (voicemailUrl) {
        eventType = "voicemail";
      } else if (answeredAt) {
        eventType = "answered";
      } else {
        eventType = "completed";
      }
    }

    // For missed calls, trigger the missed-call-handler edge function
    if (eventType === "missed") {
      try {
        const handlerResponse = await fetch(`${supabaseFunctionsUrl}/missed-call-handler`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            phone: fromPhone,
            contractor_id: contractorId,
            call_sid: callSid,
            workspace_id: workspaceId,
            duration: callDuration ? parseInt(callDuration) : null,
            voicemail_url: voicemailUrl,
          }),
        });

        if (!handlerResponse.ok) {
          const errorData = await handlerResponse.json();
          console.error("Missed call handler error:", errorData);
          // Continue even if handler fails
        }
      } catch (handlerError) {
        console.error("Error calling missed-call-handler:", handlerError);
        // Continue even if handler fails
      }
    }

    // Log all call events (not just missed)
    try {
      await supabase.from("call_logs").insert({
        contractor_id: contractorId,
        workspace_id: workspaceId,
        phone: fromPhone,
        event: eventType,
        call_sid: callSid,
        duration: callDuration ? parseInt(callDuration) : null,
        voicemail_url: voicemailUrl,
        answered_at: answeredAt,
      });
    } catch (logError) {
      console.error("Error logging call:", logError);
      // Continue even if logging fails
    }

    // Return appropriate response based on provider
    if (provider === "twilio") {
      // Twilio expects TwiML response
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Please leave a message after the tone.</Say>
  <Record maxLength="60" />
</Response>`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/xml",
          },
        }
      );
    }

    // Vonage/JSON response
    return NextResponse.json({ ok: true, event: eventType });
  } catch (error) {
    console.error("Call webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Helper function to detect provider from webhook body
function detectProvider(body: any): string {
  if (body.CallSid || body.CallStatus) {
    return "twilio";
  }
  if (body.uuid || body.conversation_uuid) {
    return "vonage";
  }
  return "generic";
}

// Also handle SMS replies (for call-classify-intent)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { call_id, reply_text, phone, contractor_id, workspace_id } = body;

    if (!call_id || !reply_text || !phone) {
      return NextResponse.json(
        { error: "call_id, reply_text, and phone are required" },
        { status: 400 }
      );
    }

    // Invoke call-classify-intent edge function
    const supabaseFunctionsUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(
      ".supabase.co",
      ".functions.supabase.co"
    );
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseFunctionsUrl}/call-classify-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        call_id,
        reply_text,
        phone,
        contractor_id,
        workspace_id,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(result, { status: response.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("SMS reply classification error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}


































