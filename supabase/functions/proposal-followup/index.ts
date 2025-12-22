// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// Edge Function: Proposal Follow-Up Automation
// Sends automated follow-up messages based on proposal status

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Find proposals unopened for 24+ hours
    const { data: unopenedProposals, error: unopenedError } = await supabase
      .from("proposals")
      .select("id, lead_id, status, created_at, leads:lead_id(phone, first_name, email)")
      .eq("status", "sent")
      .lt("created_at", twentyFourHoursAgo.toISOString());

    if (unopenedError) {
      console.error("Error fetching unopened proposals:", unopenedError);
    }

    // 2. Find proposals viewed but not signed (24+ hours since last view)
    const { data: viewedProposals, error: viewedError } = await supabase
      .from("proposals")
      .select("id, lead_id, status, last_viewed_at, viewed_count, leads:lead_id(phone, first_name, email)")
      .eq("status", "viewed")
      .not("last_viewed_at", "is", null)
      .lt("last_viewed_at", twentyFourHoursAgo.toISOString());

    if (viewedError) {
      console.error("Error fetching viewed proposals:", viewedError);
    }

    // 3. Find proposals viewed 3+ times (hot lead)
    const { data: hotProposals, error: hotError } = await supabase
      .from("proposals")
      .select("id, lead_id, status, viewed_count, last_viewed_at, leads:lead_id(phone, first_name, email)")
      .eq("status", "viewed")
      .gte("viewed_count", 3);

    if (hotError) {
      console.error("Error fetching hot proposals:", hotError);
    }

    // 4. Find proposals 7+ days old
    const { data: oldProposals, error: oldError } = await supabase
      .from("proposals")
      .select("id, lead_id, status, created_at, price, leads:lead_id(phone, first_name, email)")
      .in("status", ["sent", "viewed"])
      .lt("created_at", sevenDaysAgo.toISOString());

    if (oldError) {
      console.error("Error fetching old proposals:", oldError);
    }

    const results = {
      unopened_reminders: 0,
      viewed_followups: 0,
      hot_lead_messages: 0,
      expiration_warnings: 0,
    };

    // Process unopened proposals
    if (unopenedProposals && unopenedProposals.length > 0) {
      for (const proposal of unopenedProposals) {
        const lead = proposal.leads as any;
        if (!lead || !lead.phone) continue;

        // Check if we already sent a reminder
        const { data: existingEvents } = await supabase
          .from("proposal_events")
          .select("id")
          .eq("proposal_id", proposal.id)
          .eq("event_type", "reminder_sent")
          .limit(1);

        if (existingEvents && existingEvents.length > 0) {
          continue; // Already sent
        }

        const message = `Hi ${lead.first_name || "there"}, we sent you a roofing proposal yesterday. Have you had a chance to review it? We're here to answer any questions!`;

        // Send SMS (using Vonage or your SMS provider)
        // For now, we'll just log it - you'll need to integrate your SMS provider
        console.log(`Sending reminder to ${lead.phone}: ${message}`);

        // Log event
        await supabase.from("proposal_events").insert({
          proposal_id: proposal.id,
          event_type: "reminder_sent",
          metadata: {
            message_type: "unopened_reminder",
            lead_phone: lead.phone,
          },
        });

        results.unopened_reminders++;
      }
    }

    // Process viewed but not signed proposals
    if (viewedProposals && viewedProposals.length > 0) {
      for (const proposal of viewedProposals) {
        const lead = proposal.leads as any;
        if (!lead || !lead.phone) continue;

        // Check if we already sent a follow-up
        const { data: existingEvents } = await supabase
          .from("proposal_events")
          .select("id")
          .eq("proposal_id", proposal.id)
          .eq("event_type", "reminder_sent")
          .gte("created_at", twentyFourHoursAgo.toISOString())
          .limit(1);

        if (existingEvents && existingEvents.length > 0) {
          continue; // Already sent recently
        }

        const message = `Hi ${lead.first_name || "there"}, I saw you viewed your roofing proposal. Do you have any questions? We're happy to discuss options or adjust anything!`;

        console.log(`Sending follow-up to ${lead.phone}: ${message}`);

        await supabase.from("proposal_events").insert({
          proposal_id: proposal.id,
          event_type: "reminder_sent",
          metadata: {
            message_type: "viewed_followup",
            lead_phone: lead.phone,
            viewed_count: proposal.viewed_count,
          },
        });

        results.viewed_followups++;
      }
    }

    // Process hot leads (viewed 3+ times)
    if (hotProposals && hotProposals.length > 0) {
      for (const proposal of hotProposals) {
        const lead = proposal.leads as any;
        if (!lead || !lead.phone) continue;

        // Check if we already sent a hot lead message
        const { data: existingEvents } = await supabase
          .from("proposal_events")
          .select("id")
          .eq("proposal_id", proposal.id)
          .eq("event_type", "reminder_sent")
          .eq("metadata->>message_type", "hot_lead")
          .limit(1);

        if (existingEvents && existingEvents.length > 0) {
          continue; // Already sent
        }

        const message = `Hi ${lead.first_name || "there"}, I noticed you've reviewed your proposal a few times. That's great! Want to move forward? We can discuss scheduling or answer any questions you have.`;

        console.log(`Sending hot lead message to ${lead.phone}: ${message}`);

        await supabase.from("proposal_events").insert({
          proposal_id: proposal.id,
          event_type: "reminder_sent",
          metadata: {
            message_type: "hot_lead",
            lead_phone: lead.phone,
            viewed_count: proposal.viewed_count,
          },
        });

        results.hot_lead_messages++;
      }
    }

    // Process old proposals (7+ days)
    if (oldProposals && oldProposals.length > 0) {
      for (const proposal of oldProposals) {
        const lead = proposal.leads as any;
        if (!lead || !lead.phone) continue;

        // Check if we already sent an expiration warning
        const { data: existingEvents } = await supabase
          .from("proposal_events")
          .select("id")
          .eq("proposal_id", proposal.id)
          .eq("event_type", "reminder_sent")
          .eq("metadata->>message_type", "expiration_warning")
          .limit(1);

        if (existingEvents && existingEvents.length > 0) {
          continue; // Already sent
        }

        const price = proposal.price ? `$${proposal.price.toLocaleString()}` : "this quote";
        const message = `Hi ${lead.first_name || "there"}, your roofing proposal for ${price} is about a week old. Prices may change soon. Want an updated quote or to move forward? Let's talk!`;

        console.log(`Sending expiration warning to ${lead.phone}: ${message}`);

        await supabase.from("proposal_events").insert({
          proposal_id: proposal.id,
          event_type: "reminder_sent",
          metadata: {
            message_type: "expiration_warning",
            lead_phone: lead.phone,
            proposal_age_days: Math.floor(
              (now.getTime() - new Date(proposal.created_at).getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          },
        });

        results.expiration_warnings++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        results,
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in proposal-followup function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































