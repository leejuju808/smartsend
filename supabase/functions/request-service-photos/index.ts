// Edge Function: request-service-photos
// Sends SMS to homeowner requesting photos of the problem area

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function sendSMS(
  to: string,
  message: string,
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get workspace SMS configuration
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("sms_provider, sms_credentials, org_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return { success: false, error: "Workspace not found" };
    }

    // Get org SMS config if workspace doesn't have it
    let smsProvider = workspace.sms_provider;
    let smsCredentials = workspace.sms_credentials;

    if (!smsProvider && workspace.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("sms_provider, sms_credentials")
        .eq("id", workspace.org_id)
        .single();

      if (org) {
        smsProvider = org.sms_provider || smsProvider;
        smsCredentials = org.sms_credentials || smsCredentials;
      }
    }

    if (!smsProvider || !smsCredentials) {
      return { success: false, error: "SMS not configured for workspace" };
    }

    const provider = (smsProvider as string).toLowerCase();
    const credentials = smsCredentials as any;

    // Send via Twilio
    if (provider === "twilio") {
      const accountSid = credentials.account_sid || credentials.accountSid;
      const authToken = credentials.auth_token || credentials.authToken;
      const fromNumber = credentials.phone_number || credentials.phoneNumber;

      if (!accountSid || !authToken || !fromNumber) {
        return { success: false, error: "Missing Twilio credentials" };
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const formData = new URLSearchParams();
      formData.append("To", to);
      formData.append("From", fromNumber);
      formData.append("Body", message);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || "Twilio API error" };
      }

      return { success: true };
    }

    // Send via Vonage/Nexmo
    if (provider === "vonage" || provider === "nexmo") {
      const apiKey = credentials.api_key || credentials.apiKey;
      const apiSecret = credentials.api_secret || credentials.apiSecret;
      const fromNumber = credentials.phone_number || credentials.phoneNumber || "SmartSend";

      if (!apiKey || !apiSecret) {
        return { success: false, error: "Missing Vonage credentials" };
      }

      const vonageUrl = "https://rest.nexmo.com/sms/json";
      const params = new URLSearchParams({
        api_key: apiKey,
        api_secret: apiSecret,
        to: to,
        from: fromNumber,
        text: message,
      });

      const response = await fetch(`${vonageUrl}?${params.toString()}`, {
        method: "POST",
      });

      return { success: response.ok };
    }

    return { success: false, error: `Unsupported SMS provider: ${provider}` };
  } catch (error: any) {
    console.error("Error sending SMS:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { ticket_id, lead_id, workspace_id, custom_message } = await req.json();

    if (!ticket_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: "ticket_id and lead_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("phone, first_name, last_name, email")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!lead.phone) {
      return new Response(
        JSON.stringify({ error: "Lead has no phone number" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace_id if not provided
    let final_workspace_id = workspace_id;
    if (!final_workspace_id) {
      const { data: ticket } = await supabase
        .from("service_tickets")
        .select("workspace_id")
        .eq("id", ticket_id)
        .single();
      
      if (ticket?.workspace_id) {
        final_workspace_id = ticket.workspace_id;
      }
    }

    if (!final_workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build message
    const leadName = lead.first_name || "there";
    const message = custom_message || 
      `Hi ${leadName}, to help us diagnose the issue quickly, please reply with a photo of the problem area.`;

    // Send SMS
    const smsResult = await sendSMS(lead.phone, message, final_workspace_id);

    if (!smsResult.success) {
      return new Response(
        JSON.stringify({ error: "Failed to send SMS", details: smsResult.error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log event
    await supabase
      .from("service_events")
      .insert({
        ticket_id,
        event: "photo_requested",
        metadata: { method: "sms", phone: lead.phone },
      });

    return new Response(
      JSON.stringify({ ok: true, message_sent: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "access-control-allow-origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in request-service-photos:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "access-control-allow-origin": "*",
        },
      }
    );
  }
});
































