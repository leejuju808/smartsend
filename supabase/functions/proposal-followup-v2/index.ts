// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// Edge Function: Proposal Follow-Up Sequences
// Sends automated follow-up messages based on proposal status

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vonageApiKey = Deno.env.get("VONAGE_API_KEY");
const vonageApiSecret = Deno.env.get("VONAGE_API_SECRET");
const vonageFromNumber = Deno.env.get("VONAGE_FROM_NUMBER");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const now = new Date();
    
    // Get scheduled follow-ups that are due
    const { data: followups, error: followupError } = await supabase
      .from("proposal_followup_sequences")
      .select(`
        *,
        proposals:proposal_id(
          id,
          status,
          token,
          leads:lead_id(id, phone, first_name, email),
          jobs:job_id(id, lead_id)
        )
      `)
      .lte("scheduled_for", now.toISOString())
      .is("sent_at", null);

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

    for (const followup of followups) {
      const proposal = followup.proposals as any;
      if (!proposal) continue;

      // Get lead details
      let lead = proposal.leads;
      if (!lead && proposal.jobs?.lead_id) {
        const { data: leadData } = await supabase
          .from("leads")
          .select("*")
          .eq("id", proposal.jobs.lead_id)
          .single();
        lead = leadData;
      }

      if (!lead || !lead.phone) {
        // Mark as sent even if we can't send (no phone number)
        await supabase
          .from("proposal_followup_sequences")
          .update({ sent_at: now.toISOString() })
          .eq("id", followup.id);
        continue;
      }

      // Generate message based on type
      const leadName = lead.first_name || "there";
      const proposalUrl = `${Deno.env.get("PORTAL_URL") || "https://app.smartsend.ai"}/proposal/${proposal.token}`;
      
      let message = "";
      switch (followup.message_type) {
        case "questions_check":
          message = `Hi ${leadName}, we sent you a roofing proposal yesterday. Do you have any questions about your options? We're here to help! View here: ${proposalUrl}`;
          break;
        case "options_discussion":
          message = `Hi ${leadName}, I wanted to check in about your roofing proposal. Would you like to go over your Good/Better/Best options? We can discuss what works best for your home. ${proposalUrl}`;
          break;
        case "upgrade_credit":
          message = `Hi ${leadName}, as a thank you for choosing us, we're offering a $500 upgrade credit if you approve your proposal this week! View options: ${proposalUrl}`;
          break;
        case "final_reminder":
          message = `Hi ${leadName}, this is a final reminder about your roofing proposal. Prices may change soon. Let's get your roof protected! ${proposalUrl}`;
          break;
        default:
          message = `Hi ${leadName}, just checking in about your roofing proposal. View here: ${proposalUrl}`;
      }

      // Send SMS
      if (vonageApiKey && vonageApiSecret) {
        try {
          const smsResponse = await fetch("https://rest.nexmo.com/sms/json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: vonageApiKey,
              api_secret: vonageApiSecret,
              to: lead.phone,
              from: vonageFromNumber || "SmartSend",
              text: message,
            }),
          });

          if (smsResponse.ok) {
            // Mark as sent
            await supabase
              .from("proposal_followup_sequences")
              .update({
                sent_at: now.toISOString(),
                message_content: message,
              })
              .eq("id", followup.id);

            // Log event
            await supabase.from("proposal_events").insert({
              proposal_id: proposal.id,
              event_type: "reminder_sent",
              metadata: {
                followup_step: followup.sequence_step,
                message_type: followup.message_type,
              },
            });

            sentCount++;
          }
        } catch (smsError) {
          console.error("Error sending SMS:", smsError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: sentCount,
        total: followups.length,
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in proposal-followup-v2:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































