// Block 10100 — Conversion Offer (Founders Deal)
// POST /api/beta/conversion-offer
// Sends the founders deal conversion message to beta testers after first homeowner reply

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// The exact conversion message from Block 10100
const CONVERSION_MESSAGE = {
  subject: "Keep SmartSend running?",
  body: `Hey — your outreach is starting to work.

Before we ramp this up, I want to give you access to the private Founders Deal. You're part of the first 10 roofing companies testing SmartSend.

Your rate will never increase, and you'll get priority access to every upgrade.

Here are your options:

Starter — $99/mo
• 1 campaign
• 500 emails/mo
• Basic AI personalization
• Reply tracking

Growth — $199/mo
• 3 campaigns
• 2,000 emails/mo
• Advanced automation
• Priority support

Domination — $399/mo
• Unlimited campaigns
• Full automation
• Revenue dashboard

Which plan do you want to activate?`,
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createSupabaseServer();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { beta_tester_id, send_via = "in_app" } = body;

    if (!beta_tester_id) {
      return NextResponse.json(
        { error: "beta_tester_id is required" },
        { status: 400 }
      );
    }

    // Get beta tester info
    const { data: betaTester, error: betaError } = await supabaseAdmin
      .from("beta_testers")
      .select("*")
      .eq("id", beta_tester_id)
      .single();

    if (betaError || !betaTester) {
      return NextResponse.json(
        { error: "Beta tester not found" },
        { status: 404 }
      );
    }

    // Check if conversion offer already sent
    const { data: existingOffer } = await supabaseAdmin
      .from("conversion_offers")
      .select("id")
      .eq("beta_tester_id", beta_tester_id)
      .eq("offer_type", "founders_deal")
      .limit(1)
      .maybeSingle();

    if (existingOffer) {
      return NextResponse.json({
        success: true,
        message: "Conversion offer already sent",
        offerId: existingOffer.id,
      });
    }

    // Get current metrics for the conversion offer
    const workspaceId = betaTester.workspace_id;
    let emailsSent = 0;
    let repliesReceived = 0;
    let hotLeads = 0;
    let estimatedJobValue = 0;

    if (workspaceId) {
      // Get metrics from beta_conversion_dashboard view
      const { data: dashboard } = await supabaseAdmin
        .from("beta_conversion_dashboard")
        .select("*")
        .eq("beta_tester_id", beta_tester_id)
        .single();

      if (dashboard) {
        emailsSent = dashboard.emails_sent || 0;
        repliesReceived = dashboard.replies_received || 0;
        hotLeads = dashboard.hot_leads || 0;
        estimatedJobValue = Number(dashboard.estimated_job_value || 0);
      } else {
        // Fallback: query directly from campaigns and leads
        const { data: campaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id")
          .eq("workspace_id", workspaceId);

        if (campaigns && campaigns.length > 0) {
          const campaignIds = campaigns.map((c) => c.id);

          // Get stats from lead_auto_follow_up_stats
          const { data: stats } = await supabaseAdmin
            .from("lead_auto_follow_up_stats")
            .select("lead_status, potential_job_value")
            .in("campaign_id", campaignIds);

          if (stats) {
            emailsSent = stats.length;
            repliesReceived = stats.filter(
              (s) => s.lead_status === "replied"
            ).length;
            hotLeads = stats.filter((s) => s.lead_status === "hot").length;
            estimatedJobValue = stats
              .filter((s) => s.potential_job_value)
              .reduce(
                (sum, s) => sum + Number(s.potential_job_value || 0),
                0
              );
          }
        }
      }
    }

    // Create conversion offer record
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("conversion_offers")
      .insert({
        beta_tester_id: beta_tester_id,
        workspace_id: workspaceId,
        account_id: betaTester.account_id,
        offer_type: "founders_deal",
        plan_options: {
          starter: { price: 99, campaigns: 1, emails_per_month: 500 },
          growth: { price: 199, campaigns: 3, emails_per_month: 2000 },
          domination: {
            price: 399,
            campaigns: null,
            emails_per_month: null,
          },
        },
        sent_at: new Date().toISOString(),
        sent_via: send_via,
        emails_sent_at_offer: emailsSent,
        replies_received_at_offer: repliesReceived,
        hot_leads_at_offer: hotLeads,
        estimated_job_value_at_offer: estimatedJobValue,
        message_subject: CONVERSION_MESSAGE.subject,
        message_body: CONVERSION_MESSAGE.body,
      })
      .select("id")
      .single();

    if (offerError || !offer) {
      console.error("Error creating conversion offer:", offerError);
      return NextResponse.json(
        { error: "Failed to create conversion offer", details: offerError },
        { status: 500 }
      );
    }

    // Update beta_tester with conversion_offer_sent_at
    await supabaseAdmin
      .from("beta_testers")
      .update({
        conversion_offer_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", beta_tester_id);

    // Send the message via email if requested
    if (send_via === "email" && betaTester.contact_email) {
      try {
        // Use your email sending service here
        // This is a placeholder - integrate with your email provider
        console.log(
          `Would send conversion email to ${betaTester.contact_email}`
        );
        // await sendEmail({
        //   to: betaTester.contact_email,
        //   subject: CONVERSION_MESSAGE.subject,
        //   body: CONVERSION_MESSAGE.body,
        // });
      } catch (emailErr) {
        console.error("Failed to send conversion email:", emailErr);
        // Don't fail the request, offer is still created
      }
    }

    return NextResponse.json({
      success: true,
      offerId: offer.id,
      message: "Conversion offer sent successfully",
      metrics: {
        emailsSent,
        repliesReceived,
        hotLeads,
        estimatedJobValue,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/beta/conversion-offer:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/beta/conversion-offer?beta_tester_id=xxx
// Get conversion offer status for a beta tester
export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseServer();
    const searchParams = req.nextUrl.searchParams;
    const beta_tester_id = searchParams.get("beta_tester_id");

    if (!beta_tester_id) {
      return NextResponse.json(
        { error: "beta_tester_id is required" },
        { status: 400 }
      );
    }

    const { data: offer, error } = await supabaseAdmin
      .from("conversion_offers")
      .select("*")
      .eq("beta_tester_id", beta_tester_id)
      .eq("offer_type", "founders_deal")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch conversion offer", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      offer: offer || null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/beta/conversion-offer:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























































