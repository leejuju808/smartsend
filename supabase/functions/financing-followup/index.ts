// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// Edge Function: Automatically send follow-ups for financing abandonment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find financing opportunities that need follow-up
    // Criteria: clicked = true, started = false, abandoned = false
    // And clicked more than 2 hours ago but less than 48 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(
      Date.now() - 48 * 60 * 60 * 1000
    ).toISOString();

    const { data: opportunities, error: oppError } = await supabase
      .from("financing_status")
      .select(`
        id,
        proposal_id,
        lead_id,
        clicked,
        started,
        approved,
        declined,
        abandoned,
        updated_at,
        proposals:proposal_id (
          id,
          workspace_id,
          proposal_data
        ),
        leads:lead_id (
          id,
          name,
          email,
          phone,
          workspace_id
        )
      `)
      .eq("clicked", true)
      .eq("started", false)
      .eq("approved", false)
      .eq("declined", false)
      .eq("abandoned", false)
      .gte("updated_at", fortyEightHoursAgo)
      .lte("updated_at", twoHoursAgo);

    if (oppError) {
      throw oppError;
    }

    if (!opportunities || opportunities.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No opportunities found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    const followUps = [];

    for (const opp of opportunities) {
      try {
        const lead = opp.leads || (opp.proposals && {
          name: opp.proposals.proposal_data?.homeowner_name,
          email: null,
          phone: null,
        });

        if (!lead || !lead.name) {
          continue;
        }

        // Calculate hours since click
        const clickedAt = new Date(opp.updated_at);
        const hoursSinceClick = Math.floor(
          (Date.now() - clickedAt.getTime()) / (1000 * 60 * 60)
        );

        // Determine which follow-up to send
        let followUpMessage = "";
        let followUpNumber = 0;

        if (hoursSinceClick >= 2 && hoursSinceClick < 24) {
          // Follow-Up #1 (2 hours later)
          followUpNumber = 1;
          followUpMessage = `Hi ${lead.name}, let me know if you want help comparing roofing financing options. We can help you get the best monthly payment.`;
        } else if (hoursSinceClick >= 24 && hoursSinceClick < 48) {
          // Follow-Up #2 (24 hours later)
          followUpNumber = 2;
          followUpMessage = `We can install your roof with low monthly payments. Want me to walk you through it?`;
        } else if (hoursSinceClick >= 48) {
          // Follow-Up #3 (48 hours later)
          followUpNumber = 3;
          followUpMessage = `Your financing link is still active. Ready to move forward?`;
        } else {
          continue; // Too soon
        }

        // Check if we already sent this follow-up
        const { data: existingFollowUp } = await supabase
          .from("financing_events")
          .select("id")
          .eq("financing_id", opp.id)
          .eq("event_type", "abandoned")
          .eq("metadata->>follow_up_number", followUpNumber.toString())
          .maybeSingle();

        if (existingFollowUp) {
          continue; // Already sent
        }

        // Send SMS if phone available, otherwise skip (email would require more setup)
        if (lead.phone) {
          const vonageUrl = Deno.env.get("VONAGE_SMS_URL");
          if (vonageUrl) {
            try {
              await fetch(vonageUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: lead.phone,
                  text: followUpMessage,
                }),
              });

              // Log the follow-up event
              await supabase.from("financing_events").insert({
                financing_id: opp.id,
                event_type: "abandoned", // Using abandoned to track follow-ups
                metadata: {
                  follow_up_number: followUpNumber,
                  message: followUpMessage,
                  sent_at: new Date().toISOString(),
                  hours_since_click: hoursSinceClick,
                },
              });

              processed++;
              followUps.push({
                lead_id: opp.lead_id,
                proposal_id: opp.proposal_id,
                follow_up_number: followUpNumber,
              });
            } catch (smsError) {
              console.error("Error sending SMS:", smsError);
            }
          }
        }

        // TODO: Send email follow-up if email available
        // This would require integrating with your email system
      } catch (error) {
        console.error(`Error processing opportunity ${opp.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        follow_ups: followUps,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in financing-followup:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































