/**
 * SMS Integration Webhook
 * 
 * Handles inbound SMS messages from:
 * - Twilio
 * - Telnyx
 * 
 * SmartSend reads + classifies inbound texts.
 * Homeowners love texting. Roofers get HOT LEAD tags instantly.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Support both Twilio and Telnyx webhook formats
    const provider = body.provider || req.headers.get("x-provider") || "twilio";
    
    let fromNumber: string;
    let toNumber: string;
    let messageBody: string;
    let messageSid: string;

    if (provider === "twilio") {
      // Twilio webhook format
      fromNumber = body.From || body.from;
      toNumber = body.To || body.to;
      messageBody = body.Body || body.body || "";
      messageSid = body.MessageSid || body.message_sid;
    } else if (provider === "telnyx") {
      // Telnyx webhook format
      fromNumber = body.data?.payload?.from?.phone_number || body.from;
      toNumber = body.data?.payload?.to?.[0]?.phone_number || body.to;
      messageBody = body.data?.payload?.text || body.text || "";
      messageSid = body.data?.payload?.id || body.message_id;
    } else {
      // Generic format
      fromNumber = body.from_number || body.from;
      toNumber = body.to_number || body.to;
      messageBody = body.message_body || body.body || body.text || "";
      messageSid = body.message_sid || body.message_id;
    }

    const integrationId = body.integration_id || req.headers.get("x-integration-id");
    const workspaceId = body.workspace_id || req.headers.get("x-workspace-id");

    if (!fromNumber || !toNumber || !integrationId || !workspaceId) {
      return NextResponse.json(
        { error: "Missing required fields: from_number, to_number, integration_id, workspace_id" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Find integration to get workspace_id if not provided
    if (!workspaceId && integrationId) {
      const { data: integration } = await supabase
        .from("integrations")
        .select("workspace_id")
        .eq("id", integrationId)
        .single();
      
      if (!integration) {
        return NextResponse.json({ error: "Integration not found" }, { status: 404 });
      }
    }

    // Store SMS message
    const { data: smsMessage, error: smsError } = await supabase
      .from("sms_messages")
      .insert({
        integration_id: integrationId,
        workspace_id: workspaceId,
        from_number: fromNumber,
        to_number: toNumber,
        message_body: messageBody,
        message_sid: messageSid,
        metadata: body
      })
      .select("id")
      .single();

    if (smsError) {
      console.error("Failed to store SMS message:", smsError);
      return NextResponse.json(
        { error: "Failed to store SMS message" },
        { status: 500 }
      );
    }

    // Try to find contact by phone number
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("phone", fromNumber.replace(/\D/g, "")) // Normalize phone
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    const email = contact?.email || `${fromNumber.replace(/\D/g, "")}@sms.unknown`;

    // Process lead through unified processing
    const processResponse = await fetch(
      `${req.nextUrl.origin}/api/integrations/roofing/process-lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.get("cookie") || ""
        },
        body: JSON.stringify({
          integration_id: integrationId,
          workspace_id: workspaceId,
          email,
          first_name: contact?.first_name || null,
          last_name: contact?.last_name || null,
          phone: fromNumber,
          source_type: "sms",
          source_id: smsMessage.id,
          message_text: messageBody,
          metadata: {
            provider,
            message_sid: messageSid,
            from_number: fromNumber,
            to_number: toNumber
          }
        })
      }
    );

    if (!processResponse.ok) {
      const error = await processResponse.json();
      console.error("Failed to process SMS lead:", error);
    } else {
      const result = await processResponse.json();
      
      // Update SMS message with classification and lead_id
      await supabase
        .from("sms_messages")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          classification: result.classification,
          lead_id: result.lead_id ? (await supabase.from("integration_leads").select("lead_id").eq("id", result.lead_id).single()).data?.lead_id : null
        })
        .eq("id", smsMessage.id);
    }

    // Return success (Twilio/Telnyx expect 200 OK)
    return NextResponse.json({
      success: true,
      message: "SMS processed successfully"
    });

  } catch (error) {
    console.error("Error processing SMS webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































