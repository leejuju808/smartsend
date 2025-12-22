// Block 28844 — SmartSend Quote Revival Engine
// Edge Function: Send Revival Message
// Sends SMS + Email revival messages to homeowners with stalled quotes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vonageSmsUrl = Deno.env.get("VONAGE_SMS_URL") || "";
const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER") || "";

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all due revival events (scheduled_at <= now, status = 'scheduled')
    const now = new Date().toISOString();
    const { data: dueEvents, error: eventsError } = await supabase
      .from("revival_events")
      .select(`
        id,
        quote_id,
        type,
        scheduled_at,
        quotes:quote_id (
          id,
          total,
          sent_at,
          lead_id,
          leads:lead_id (
            id,
            email,
            phone,
            first_name,
            last_name,
            workspace_id
          )
        )
      `)
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(50); // Process in batches

    if (eventsError) {
      console.error("Error fetching due revival events:", eventsError);
      return new Response(
        JSON.stringify({ error: eventsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!dueEvents || dueEvents.length === 0) {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: "No due revival events to process",
          sent: 0 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const event of dueEvents) {
      try {
        const quote = (event.quotes as any);
        if (!quote || !quote.leads) {
          console.error(`Quote or lead not found for event ${event.id}`);
          errorCount++;
          continue;
        }

        const lead = quote.leads;
        const name = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "there";
        const email = lead.email;
        const phone = lead.phone;
        const quoteAmount = quote.total || 0;

        // Get price drop rules if this is an offer message
        let discountAmount = 0;
        let discountText = "";
        if (event.type === "offer") {
          const { data: priceRules } = await supabase
            .from("price_drop_rules")
            .select("*")
            .eq("workspace_id", lead.workspace_id)
            .eq("enable_discounts", true)
            .single();

          if (priceRules && priceRules.used_this_month < priceRules.monthly_limit) {
            if (priceRules.discount_type === "percent") {
              discountAmount = (quoteAmount * priceRules.discount_value) / 100;
              discountText = `${priceRules.discount_value}% off ($${discountAmount.toFixed(0)})`;
            } else if (priceRules.discount_type === "fixed") {
              discountAmount = priceRules.discount_value;
              discountText = `$${discountAmount.toFixed(0)} off`;
            }
          }
        }

        // Generate message based on type
        let messageText = "";
        let emailSubject = "";
        let emailBody = "";

        switch (event.type) {
          case "check_in_3":
            messageText = `Hi ${name}, wanted to see if you had any questions about the quote we sent. Feel free to reach out anytime!`;
            emailSubject = "Quick Check-In — Any Questions?";
            emailBody = `Hi ${name},<br><br>I wanted to check in and see if you had any questions about the roofing estimate we sent. We're here to help!<br><br>Feel free to reply to this email or give us a call.`;
            break;

          case "check_in_6":
            messageText = `Hi ${name}, if you want, we can go over options or rework the numbers a bit. What works best for you?`;
            emailSubject = "Let's Discuss Your Options";
            emailBody = `Hi ${name},<br><br>I wanted to follow up and see if we can help make this work for you. We're happy to go over different options or adjust the numbers if needed.<br><br>What works best for you?`;
            break;

          case "offer":
            if (discountText) {
              messageText = `Hi ${name}, we can save you ${discountText} on your project if you schedule this week. Want details?`;
              emailSubject = `Special Offer: ${discountText} on Your Roofing Project`;
              emailBody = `Hi ${name},<br><br>We'd like to make this work for you! We can offer you ${discountText} on your roofing project if you schedule this week.<br><br>Interested? Reply to this email or give us a call and we'll get you set up.`;
            } else {
              // No discount available, skip offer message
              await supabase
                .from("revival_events")
                .update({ status: "cancelled" })
                .eq("id", event.id);
              continue;
            }
            break;

          case "final":
            messageText = `Hi ${name}, final check-in — want us to hold your spot for this month? Let me know!`;
            emailSubject = "Final Check-In — Hold Your Spot?";
            emailBody = `Hi ${name},<br><br>This is our final check-in. We'd love to work with you on your roofing project. Would you like us to hold your spot for this month?<br><br>Let me know and we'll get everything scheduled.`;
            break;

          default:
            console.error(`Unknown revival event type: ${event.type}`);
            errorCount++;
            continue;
        }

        // Send SMS if phone provided
        if (phone && (vonageSmsUrl || (twilioAccountSid && twilioAuthToken))) {
          try {
            if (vonageSmsUrl) {
              // Use Vonage/Nexmo
              await fetch(vonageSmsUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: phone,
                  text: messageText,
                }),
              });
            } else if (twilioAccountSid && twilioAuthToken) {
              // Use Twilio
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
              const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
              const formData = new URLSearchParams();
              formData.append("To", phone);
              formData.append("From", twilioFromNumber || twilioAccountSid);
              formData.append("Body", messageText);

              await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${auth}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: formData.toString(),
              });
            }
          } catch (smsError) {
            console.error(`Error sending SMS for event ${event.id}:`, smsError);
            // Continue even if SMS fails
          }
        }

        // Send Email
        if (email) {
          try {
            // Try to invoke email sending function
            await supabase.functions.invoke("send-email", {
              body: {
                to: email,
                subject: emailSubject,
                text: messageText,
                html: emailBody,
              },
            }).catch(async () => {
              // Fallback: Use inbox send API pattern
              // This would need to be adapted to your email sending setup
              console.log(`Email would be sent to ${email} with subject: ${emailSubject}`);
            });
          } catch (emailError) {
            console.error(`Error sending email for event ${event.id}:`, emailError);
            // Continue even if email fails
          }
        }

        // Update revival event status
        await supabase
          .from("revival_events")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            message: messageText,
          })
          .eq("id", event.id);

        // If this was an offer and discount was used, increment counter
        if (event.type === "offer" && discountAmount > 0) {
          await supabase.rpc("increment_discount_usage", {
            p_workspace_id: lead.workspace_id,
          });
        }

        sentCount++;
      } catch (eventError) {
        console.error(`Error processing revival event ${event.id}:`, eventError);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: dueEvents.length,
        sent: sentCount,
        errors: errorCount,
        message: `Processed ${dueEvents.length} revival events: ${sentCount} sent, ${errorCount} errors`,
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


































