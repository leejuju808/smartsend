// Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
// Edge Function: Automated Follow-Up Sender (Cron)
// Sends scheduled follow-up messages automatically

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to send SMS
async function sendSMS(
  to: string,
  message: string,
  provider: string,
  credentials: any
): Promise<{ success: boolean; error?: string }> {
  try {
    if (provider === "twilio" || provider === "Twilio") {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid || credentials.accountSid}/Messages.json`;
      const formData = new URLSearchParams({
        To: to,
        From: credentials.phone_number || credentials.phoneNumber,
        Body: message,
      });

      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${btoa(`${credentials.account_sid || credentials.accountSid}:${credentials.auth_token || credentials.authToken}`)}`,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || "Twilio API error" };
      }

      return { success: true };
    } else if (provider === "vonage" || provider === "nexmo" || provider === "Vonage" || provider === "Nexmo") {
      const vonageUrl = "https://rest.nexmo.com/sms/json";
      const params = new URLSearchParams({
        api_key: credentials.api_key || credentials.apiKey,
        api_secret: credentials.api_secret || credentials.apiSecret,
        to: to,
        from: credentials.phone_number || credentials.phoneNumber || "SmartSend",
        text: message,
      });

      const response = await fetch(`${vonageUrl}?${params.toString()}`, {
        method: "POST",
      });

      return { success: response.ok };
    }

    return { success: false, error: `Unsupported provider: ${provider}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Helper function to send email
async function sendEmail(
  to: string,
  subject: string,
  body: string,
  workspaceId: string,
  supabase: any
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use existing email sending infrastructure
    // This would typically call your email service (SendGrid, Resend, etc.)
    // For now, we'll log it and mark as sent
    // In production, integrate with your email sending service
    
    // Example: Insert into email_logs or call email-send function
    const { error } = await supabase.from("email_logs").insert({
      lead_id: null, // Would need to get from context
      workspace_id: workspaceId,
      to_email: to,
      subject: subject,
      body_html: body,
      body_text: body.replace(/<[^>]*>/g, ""), // Strip HTML for text version
      status: "sent",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();

    // Get all follow-ups that are due and not yet sent
    const { data: followups, error: followupError } = await supabase
      .from("sales_followups")
      .select(`
        *,
        proposals:proposal_id(
          id,
          status,
          amount,
          leads:lead_id(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        )
      `)
      .lte("scheduled_at", now.toISOString())
      .eq("sent", false);

    if (followupError) {
      console.error("Error fetching follow-ups:", followupError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch follow-ups" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!followups || followups.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: "No follow-ups due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const followup of followups) {
      const proposal = followup.proposals as any;
      if (!proposal) {
        // Mark as sent even if proposal not found (to avoid retrying)
        await supabase
          .from("sales_followups")
          .update({ sent: true, sent_at: now.toISOString() })
          .eq("id", followup.id);
        continue;
      }

      const lead = proposal.leads;
      if (!lead) {
        // Mark as sent even if lead not found
        await supabase
          .from("sales_followups")
          .update({ sent: true, sent_at: now.toISOString() })
          .eq("id", followup.id);
        continue;
      }

      // Skip if proposal is already approved
      if (proposal.status === "approved") {
        await supabase
          .from("sales_followups")
          .update({ sent: true, sent_at: now.toISOString() })
          .eq("id", followup.id);
        continue;
      }

      let sendResult = { success: false, error: "" };

      if (followup.type === "sms") {
        if (!lead.phone) {
          console.log(`No phone number for lead ${lead.id}, skipping SMS`);
          await supabase
            .from("sales_followups")
            .update({ sent: true, sent_at: now.toISOString() })
            .eq("id", followup.id);
          continue;
        }

        // Get workspace SMS config
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("sms_provider, sms_credentials")
          .eq("id", followup.workspace_id)
          .single();

        if (workspace?.sms_provider && workspace?.sms_credentials) {
          sendResult = await sendSMS(
            lead.phone,
            followup.message,
            workspace.sms_provider,
            workspace.sms_credentials
          );
        } else {
          sendResult = { success: false, error: "SMS not configured for workspace" };
        }
      } else if (followup.type === "email") {
        if (!lead.email) {
          console.log(`No email for lead ${lead.id}, skipping email`);
          await supabase
            .from("sales_followups")
            .update({ sent: true, sent_at: now.toISOString() })
            .eq("id", followup.id);
          continue;
        }

        // Generate subject line
        const subject = followup.follow_up_type === "rescue"
          ? "Quick check-in about your roofing proposal"
          : followup.follow_up_type === "pre_expiration"
          ? "Your roofing proposal expires soon"
          : followup.follow_up_type === "last_chance"
          ? "Last chance: Your roofing proposal"
          : "Following up on your roofing proposal";

        sendResult = await sendEmail(
          lead.email,
          subject,
          followup.message,
          followup.workspace_id,
          supabase
        );
      } else if (followup.type === "voicemail") {
        // Voicemail scripts are for manual use, mark as sent
        sendResult = { success: true };
      }

      if (sendResult.success) {
        // Mark as sent
        await supabase
          .from("sales_followups")
          .update({
            sent: true,
            sent_at: now.toISOString(),
          })
          .eq("id", followup.id);

        // Log proposal event
        await supabase.from("proposal_events").insert({
          proposal_id: proposal.id,
          lead_id: lead.id,
          workspace_id: followup.workspace_id,
          event_type: "proposal_followup",
          metadata: {
            followup_type: followup.follow_up_type,
            followup_sequence_day: followup.follow_up_sequence_day,
            message_type: followup.type,
          },
        });

        sentCount++;
      } else {
        console.error(`Failed to send follow-up ${followup.id}:`, sendResult.error);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: sentCount,
        errors: errorCount,
        total: followups.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































