// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/reminder
// Cron that sends follow-up reminders

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://app.smartsend.ai";

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find proposals needing reminders
    // 1. Not viewed after 24 hours
    const { data: notViewed, error: notViewedError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*)
      `)
      .eq("status", "sent")
      .is("viewed_at", null)
      .lte("sent_at", twentyFourHoursAgo.toISOString());

    // 2. Viewed but not signed
    const { data: viewedNotSigned, error: viewedNotSignedError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*)
      `)
      .eq("status", "viewed")
      .is("signed_at", null)
      .not("viewed_at", "is", null);

    // 3. Opened multiple times but not signed (high engagement, might have questions)
    const { data: highEngagement, error: highEngagementError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*),
        view_logs:proposal_view_logs(count)
      `)
      .eq("status", "viewed")
      .is("signed_at", null)
      .gte("viewed_at", sevenDaysAgo.toISOString());

    const reminders = [];

    // Process not viewed proposals
    if (notViewed && notViewed.length > 0) {
      for (const proposal of notViewed) {
        reminders.push({
          proposal_id: proposal.id,
          type: "not_viewed_24h",
          message: "We sent you a proposal 24 hours ago. Have you had a chance to review it?",
          proposal_link: `${siteUrl}/proposal/${proposal.public_token}`,
          homeowner_email: proposal.homeowner?.email,
        });
      }
    }

    // Process viewed but not signed
    if (viewedNotSigned && viewedNotSigned.length > 0) {
      for (const proposal of viewedNotSigned) {
        reminders.push({
          proposal_id: proposal.id,
          type: "viewed_not_signed",
          message: "You viewed our proposal. Do you have any questions? We're here to help!",
          proposal_link: `${siteUrl}/proposal/${proposal.public_token}`,
          homeowner_email: proposal.homeowner?.email,
        });
      }
    }

    // Process high engagement (opened multiple times)
    if (highEngagement && highEngagement.length > 0) {
      for (const proposal of highEngagement) {
        const viewCount = proposal.view_logs?.length || 0;
        if (viewCount >= 3) {
          reminders.push({
            proposal_id: proposal.id,
            type: "high_engagement_questions",
            message: "We noticed you've reviewed our proposal multiple times. Do you have questions we can answer?",
            proposal_link: `${siteUrl}/proposal/${proposal.public_token}`,
            homeowner_email: proposal.homeowner?.email,
          });
        }
      }
    }

    // TODO: Send actual emails via email service
    // For now, just return the reminders that would be sent
    console.log(`Found ${reminders.length} proposals needing reminders`);

    return new Response(
      JSON.stringify({ 
        reminders_sent: reminders.length,
        reminders,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-reminder:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































