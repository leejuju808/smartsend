// Block 31440 — SmartSend Roofing Job Pipeline v1
// Edge Function: /send-job-update
// Sends customer updates (SMS + Email) when job stage changes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Stage-specific messages
const stageMessages: Record<string, { sms: string; email: { subject: string; body: string } }> = {
  estimate: {
    sms: "We have sent your estimate. Let us know if you have questions!",
    email: {
      subject: "Your Roofing Estimate is Ready",
      body: "We have sent your estimate. Please review it and let us know if you have any questions. We're here to help!",
    },
  },
  approved: {
    sms: "Your roofing project has been approved. We will begin scheduling.",
    email: {
      subject: "Your Roofing Project Has Been Approved",
      body: "Great news! Your roofing project has been approved. We will begin scheduling your installation shortly. We'll keep you updated every step of the way.",
    },
  },
  insurance: {
    sms: "We are coordinating with your insurance provider.",
    email: {
      subject: "Insurance Coordination in Progress",
      body: "We are currently coordinating with your insurance provider to ensure everything is in order. We'll update you as soon as we have more information.",
    },
  },
  materials: {
    sms: "Your roofing materials have been ordered.",
    email: {
      subject: "Materials Ordered for Your Roofing Project",
      body: "Your roofing materials have been ordered. We'll notify you once they arrive and are ready for installation.",
    },
  },
  scheduled: {
    sms: "Your roof installation is scheduled. We'll send you the exact time soon.",
    email: {
      subject: "Your Roof Installation is Scheduled",
      body: "Your roof installation has been scheduled. We'll send you the exact date and time shortly. Our crew will arrive on time and ready to work.",
    },
  },
  in_progress: {
    sms: "Your roof installation has begun. Our crew is on-site working.",
    email: {
      subject: "Your Roof Installation Has Started",
      body: "Your roof installation has begun! Our crew is on-site and working. We'll keep you updated on progress throughout the day.",
    },
  },
  completed: {
    sms: "Your roof project is complete! Thank you for choosing us. Final walkthrough scheduled.",
    email: {
      subject: "Your Roofing Project is Complete!",
      body: "Congratulations! Your roofing project is complete. We'll schedule a final walkthrough with you to ensure everything meets your expectations. Thank you for choosing us!",
    },
  },
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { job_id, stage, lead_id } = payload;

    if (!job_id || !stage) {
      return new Response(
        JSON.stringify({ error: "Missing job_id or stage" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("lead_id, team_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      console.error("Job not found:", jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadIdToUse = lead_id || job.lead_id;
    if (!leadIdToUse) {
      console.log("No lead_id associated with job, skipping notification");
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_lead" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("name, email, phone, first_name, last_name")
      .eq("id", leadIdToUse)
      .single();

    if (leadError || !lead) {
      console.error("Lead not found:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get message for this stage
    const message = stageMessages[stage] || {
      sms: "Your project status has been updated.",
      email: {
        subject: "Project Status Update",
        body: "Your project status has been updated. We'll keep you informed of any changes.",
      },
    };

    const leadName = lead.name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Valued Customer";

    // Send SMS if phone available
    let smsSent = false;
    if (lead.phone) {
      try {
        // Get team SMS configuration
        const { data: team } = await supabase
          .from("teams")
          .select("id, sms_provider, sms_credentials")
          .eq("id", job.team_id)
          .single();

        if (team?.sms_provider && team?.sms_credentials) {
          const smsResult = await sendSMS(
            lead.phone,
            message.sms,
            team.sms_provider,
            team.sms_credentials
          );
          smsSent = smsResult.success;
        } else {
          // Fallback to environment variables
          const vonageSmsUrl = Deno.env.get("VONAGE_SMS_URL");
          const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
          const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
          const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

          if (vonageSmsUrl) {
            const smsResponse = await fetch(vonageSmsUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: lead.phone,
                text: message.sms,
              }),
            });
            smsSent = smsResponse.ok;
          } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
            const formData = new URLSearchParams({
              To: lead.phone,
              From: twilioPhoneNumber,
              Body: message.sms,
            });

            const twilioResponse = await fetch(twilioUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              },
              body: formData.toString(),
            });
            smsSent = twilioResponse.ok;
          }
        }
      } catch (smsError) {
        console.error("Error sending SMS:", smsError);
        // Continue even if SMS fails
      }
    }

    // Send Email if email available
    let emailSent = false;
    if (lead.email) {
      try {
        // Try to use existing email-send edge function or send directly
        const emailBody = `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2>${message.email.subject}</h2>
              <p>Hello ${leadName},</p>
              <p>${message.email.body}</p>
              <p>Best regards,<br>SmartSend Team</p>
            </body>
          </html>
        `;

        // Try invoking email-send function if it exists
        try {
          const emailFunctionUrl = `${supabaseUrl}/functions/v1/email-send`;
          const emailResponse = await fetch(emailFunctionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceRoleKey}`,
            },
            body: JSON.stringify({
              to: lead.email,
              subject: message.email.subject,
              html: emailBody,
            }),
          });
          emailSent = emailResponse.ok;
        } catch (emailFnError) {
          // Fallback: Try Resend API if available
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (resendApiKey) {
            const resendResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "SmartSend <notifications@smartsend.ai>",
                to: lead.email,
                subject: message.email.subject,
                html: emailBody,
              }),
            });
            emailSent = resendResponse.ok;
          }
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Continue even if email fails
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sms_sent: smsSent,
        email_sent: emailSent,
        stage,
        lead_id: leadIdToUse,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Send job update error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Helper function to send SMS via provider
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

      return { success: response.ok };
    } else if (provider === "vonage" || provider === "nexmo" || provider === "Vonage" || provider === "Nexmo") {
      const vonageUrl = credentials.api_url || Deno.env.get("VONAGE_SMS_URL");
      if (!vonageUrl) {
        return { success: false, error: "Vonage URL not configured" };
      }

      const response = await fetch(vonageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          text: message,
        }),
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


































