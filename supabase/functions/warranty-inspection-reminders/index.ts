// Block 32277 — SmartSend Roofing Warranty Inspection Reminder Engine v1
// Edge Function: /warranty-inspection-reminders
// Sends inspection reminders at 30 days, 7 days, 0 days, and -20 days before due date

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

// Reminder messages based on days until due
const reminderMessages: Record<number, { sms: string; email: { subject: string; body: string } }> = {
  30: {
    sms: "Your annual roofing inspection is coming up next month. Reply YES to schedule.",
    email: {
      subject: "Annual Roofing Inspection Reminder - Next Month",
      body: "Your annual roofing inspection is coming up next month. This helps us catch any issues early and keep your roof in great condition. Reply to this email or text us to schedule your inspection.",
    },
  },
  7: {
    sms: "Your annual roofing inspection is coming up next week. Reply YES to schedule.",
    email: {
      subject: "Annual Roofing Inspection Reminder - Next Week",
      body: "Your annual roofing inspection is scheduled for next week. Please reply to confirm a convenient time, or let us know if you need to reschedule.",
    },
  },
  0: {
    sms: "Your annual roofing inspection is due today. Reply YES to schedule.",
    email: {
      subject: "Annual Roofing Inspection - Due Today",
      body: "Your annual roofing inspection is due today. Please reply to schedule a convenient time for our technician to come out and inspect your roof.",
    },
  },
  [-20]: {
    sms: "You missed your annual roofing inspection — reply to reschedule.",
    email: {
      subject: "Missed Annual Roofing Inspection - Reschedule Now",
      body: "We noticed you missed your annual roofing inspection. It's important to keep your roof in good condition. Please reply to reschedule at your convenience.",
    },
  },
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all pending inspections
    const { data: inspections, error: inspectionsError } = await supabase
      .from("warranty_inspections")
      .select("id, warranty_id, due_date, completed")
      .eq("completed", false);

    if (inspectionsError) {
      console.error("Error fetching inspections:", inspectionsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch inspections" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!inspections || inspections.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No pending inspections" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let sent = 0;
    const errors: string[] = [];

    for (const inspection of inspections) {
      if (inspection.completed) continue;

      const dueDate = new Date(inspection.due_date);
      dueDate.setHours(0, 0, 0, 0);

      // Calculate days difference
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Check if we need to send a reminder (30, 7, 0, or -20 days)
      const reminderDays = [30, 7, 0, -20];
      if (!reminderDays.includes(diffDays)) {
        continue;
      }

      processed++;

      // Get warranty and homeowner info
      const { data: warranty, error: warrantyError } = await supabase
        .from("warranties")
        .select("homeowner_id, job_id")
        .eq("id", inspection.warranty_id)
        .single();

      if (warrantyError || !warranty) {
        errors.push(`Warranty not found for inspection ${inspection.id}`);
        continue;
      }

      // Get homeowner contact info
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("id, email, phone, first_name, last_name, name")
        .eq("id", warranty.homeowner_id)
        .single();

      if (leadError || !lead) {
        errors.push(`Lead not found for warranty ${inspection.warranty_id}`);
        continue;
      }

      const message = reminderMessages[diffDays];
      if (!message) {
        continue;
      }

      const homeownerName = lead.name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Valued Customer";

      // Send SMS if phone available
      let smsSent = false;
      if (lead.phone) {
        try {
          // Try to get team SMS configuration from job
          const { data: job } = await supabase
            .from("jobs")
            .select("team_id")
            .eq("id", warranty.job_id)
            .single();

          if (job?.team_id) {
            const { data: team } = await supabase
              .from("teams")
              .select("sms_provider, sms_credentials")
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
            }
          }

          // Fallback to environment variables
          if (!smsSent) {
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
          errors.push(`SMS error for inspection ${inspection.id}: ${smsError}`);
        }
      }

      // Send Email if email available
      let emailSent = false;
      if (lead.email) {
        try {
          const emailBody = `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2>${message.email.subject}</h2>
                <p>Hello ${homeownerName},</p>
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
          errors.push(`Email error for inspection ${inspection.id}: ${emailError}`);
        }
      }

      if (smsSent || emailSent) {
        sent++;
      }

      // If it's the -20 day reminder, tag the inspection as missed
      if (diffDays === -20) {
        await supabase
          .from("warranty_inspections")
          .update({ notes: (inspection.notes || '') + (inspection.notes ? '; ' : '') + 'Inspection missed - reminder sent' })
          .eq("id", inspection.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        sent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Warranty inspection reminder error:", error);
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

































