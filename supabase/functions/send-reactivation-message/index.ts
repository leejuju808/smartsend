// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// Edge Function: Send Reactivation Message
// Sends SMS + Email for reactivation events

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vonageSmsUrl = Deno.env.get("VONAGE_SMS_URL") || "";
const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER") || "";

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { event_id, phone, email, name, type } = await req.json();
    
    if (!event_id) {
      return new Response(
        JSON.stringify({ error: "event_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Get reactivation event
    const { data: event, error: eventError } = await supabase
      .from("reactivation_events")
      .select(`
        *,
        past_customers:past_customer_id (
          id,
          homeowner_name,
          email,
          phone,
          job_completed_at,
          roof_type
        )
      `)
      .eq("id", event_id)
      .single();
    
    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Reactivation event not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Use provided data or fall back to past customer data
    const customerName = name || event.past_customers?.homeowner_name || "there";
    const customerEmail = email || event.past_customers?.email;
    const customerPhone = phone || event.past_customers?.phone;
    const eventType = type || event.type;
    
    // Generate message based on type
    let msg = "";
    let subject = "";
    
    switch (eventType) {
      case "3m":
        msg = `Hi ${customerName}, it's been a few months since your roof was installed. Want a quick check-up or gutter clean?`;
        subject = "Quick Roof Check-In";
        break;
      case "1y":
        msg = `Hi ${customerName}, your 1-year roof inspection is recommended. Want to schedule a quick look?`;
        subject = "1-Year Roof Inspection";
        break;
      case "3y":
        msg = `Hi ${customerName}, your roof is due for a soft wash or maintenance check. Interested?`;
        subject = "Roof Maintenance Check";
        break;
      case "5y":
        msg = `Hi ${customerName}, it's been a few years. We recommend a maintenance inspection to keep warranties strong.`;
        subject = "5-Year Maintenance Inspection";
        break;
      case "7y":
        msg = `Hi ${customerName}, roofs near year 7 often need a condition check. Want us to look?`;
        subject = "7-Year Roof Condition Check";
        break;
      case "10y":
        msg = `Hi ${customerName}, your roof is entering its replacement window. Want a free inspection?`;
        subject = "Free Roof Replacement Inspection";
        break;
      case "seasonal":
        msg = `Hi ${customerName}, it's the perfect time for seasonal roof maintenance. Want to schedule?`;
        subject = "Seasonal Roof Maintenance";
        break;
      default:
        msg = `Hi ${customerName}, we wanted to check in about your roof. Want to schedule an inspection?`;
        subject = "Roof Check-In";
    }
    
    let smsSent = false;
    let emailSent = false;
    
    // Send SMS if phone provided
    if (customerPhone && (vonageSmsUrl || (twilioAccountSid && twilioAuthToken))) {
      try {
        if (vonageSmsUrl) {
          // Use Vonage/Nexmo
          const smsResponse = await fetch(vonageSmsUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: customerPhone,
              text: msg,
            }),
          });
          
          if (smsResponse.ok) {
            smsSent = true;
          }
        } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          // Use Twilio
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const formData = new URLSearchParams({
            To: customerPhone,
            From: twilioPhoneNumber,
            Body: msg,
          });
          
          const twilioResponse = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
            },
            body: formData.toString(),
          });
          
          if (twilioResponse.ok) {
            smsSent = true;
          }
        }
      } catch (smsError) {
        console.error("Error sending SMS:", smsError);
        // Continue even if SMS fails
      }
    }
    
    // Send Email if email provided
    if (customerEmail) {
      try {
        // Try to use existing email sending function
        const emailResult = await supabase.functions.invoke("send-email", {
          body: {
            to: customerEmail,
            subject: subject,
            text: msg,
            html: `
              <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <p>${msg}</p>
                  <p style="margin-top: 20px;">Best regards,<br>Your Roofing Team</p>
                </body>
              </html>
            `,
          },
        });
        
        if (emailResult.ok) {
          emailSent = true;
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Continue even if email fails
      }
    }
    
    // Update event status
    const messageSentVia = [];
    if (smsSent) messageSentVia.push("sms");
    if (emailSent) messageSentVia.push("email");
    
    await supabase
      .from("reactivation_events")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        message_text: msg,
        message_sent_via: messageSentVia.join(","),
      })
      .eq("id", event_id);
    
    return new Response(
      JSON.stringify({
        ok: true,
        event_id: event_id,
        sms_sent: smsSent,
        email_sent: emailSent,
        message: "Reactivation message sent successfully",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































