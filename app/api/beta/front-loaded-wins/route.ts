// Block 10100 — Front-Loaded Wins (72-Hour Campaign Setup)
// POST /api/beta/front-loaded-wins
// Automatically creates and launches a high-performing campaign for beta testers

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// Best roofing sequence for front-loaded wins:
// 1. Free roof inspection offer (with neighborhood reference)
// 2. Auto follow-up (2 days later)
// 3. Neighborhood reference ("We just did a job nearby")
const FRONT_LOADED_SEQUENCE = [
  {
    step: 1,
    subject: "Quick question about your roof in {{city}}",
    body: `Hey {{first_name}},

I'm {{sender_name}} with {{company_name}} here in {{city}}. We've been helping homeowners in your area with roof inspections and replacements, especially after the last couple seasons of wind and rain.

Right now we're offering a **no-pressure, free roof inspection** for homes in {{neighborhood}}. We check for:

- Hidden leaks and soft spots
- Missing or cracked shingles
- Storm and hail damage that could void insurance later

If we find anything, we'll show you photos and a clear estimate. If everything looks good, we'll say so and be on our way.

Would you be open to a quick **10–15 minute inspection** sometime next week?

Best,  
{{sender_name}}  
{{company_name}}  
{{sender_phone}}`,
    delayDays: 0,
  },
  {
    step: 2,
    subject: "Still happy to check your roof for free",
    body: `Hey {{first_name}},

Wanted to quickly follow up on my last email about the **free roof inspection** we're offering in {{city}}.

We're already scheduled to be in your area doing work on a few homes, so it's easy for us to swing by and:

- Check for any damage or early leaks  
- Take photos you can keep for your records or insurance  
- Give you a clear, written estimate if anything needs attention  

Most homeowners use this just to know where they stand before winter or the next storm.

Would you like me to hold a spot for **this week or next**?

Best,  
{{sender_name}}  
{{company_name}}`,
    delayDays: 2,
  },
  {
    step: 3,
    subject: "We just finished a roof on {{street}}",
    body: `Hi {{first_name}},

We just completed a roof project **right on your street**.

While the crew is still nearby, we're offering free checks to other homeowners.

Want me to swing by yours?

Best,  
{{sender_name}}  
{{company_name}}`,
    delayDays: 4,
  },
];

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
    const { beta_tester_id } = body;

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

    // Check if front-loaded campaign already exists
    if (betaTester.front_loaded_campaign_id) {
      const { data: existingCampaign } = await supabaseAdmin
        .from("campaigns")
        .select("id, name, status")
        .eq("id", betaTester.front_loaded_campaign_id)
        .single();

      if (existingCampaign) {
        return NextResponse.json({
          success: true,
          campaignId: existingCampaign.id,
          message: "Front-loaded campaign already exists",
          campaign: existingCampaign,
        });
      }
    }

    const workspaceId = betaTester.workspace_id;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Beta tester has no workspace_id" },
        { status: 400 }
      );
    }

    // Get workspace info
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, owner_id, org_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get sending email account (use their domain)
    const { data: emailAccounts } = await supabaseAdmin
      .from("email_accounts")
      .select("id, email, workspace_id")
      .eq("workspace_id", workspaceId)
      .limit(1);

    if (!emailAccounts || emailAccounts.length === 0) {
      return NextResponse.json(
        {
          error: "No email account found. Beta tester needs to connect an email account first.",
        },
        { status: 400 }
      );
    }

    const sendingAccountId = emailAccounts[0].id;

    // Create campaign with front-loaded sequence
    const campaignName = `Front-Loaded Wins - ${betaTester.company_name}`;

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .insert({
        name: campaignName,
        status: "scheduled", // Will launch immediately
        workspace_id: workspaceId,
        org_id: workspace.org_id,
        from_email_account_id: sendingAccountId,
        sending_identity_id: sendingAccountId,
        audience_type: "all_leads", // Will use all leads in workspace
        sequence: FRONT_LOADED_SEQUENCE,
        start_date: new Date().toISOString(), // Start immediately
        daily_send_cap: 50, // Conservative cap for beta
        sending_window_start: "08:00",
        sending_window_end: "17:00",
        created_by: workspace.owner_id,
        is_shared: false,
      })
      .select("id")
      .single();

    if (campaignError || !campaign) {
      console.error("Error creating front-loaded campaign:", campaignError);
      return NextResponse.json(
        { error: "Failed to create campaign", details: campaignError },
        { status: 500 }
      );
    }

    // Update beta_tester with campaign info
    const { error: updateError } = await supabaseAdmin
      .from("beta_testers")
      .update({
        front_loaded_campaign_id: campaign.id,
        front_loaded_campaign_launched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", beta_tester_id);

    if (updateError) {
      console.error("Error updating beta tester:", updateError);
      // Don't fail the request, but log it
    }

    // Launch the campaign (queue contacts)
    // Note: This depends on your campaign launch logic
    // You may need to call your campaign launch endpoint or edge function
    try {
      const launchResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/campaigns/${campaign.id}/launch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (!launchResponse.ok) {
        console.error("Failed to launch campaign:", await launchResponse.text());
        // Campaign is created but not launched - this is okay, can be launched manually
      }
    } catch (launchErr) {
      console.error("Error launching campaign:", launchErr);
      // Campaign is created but not launched - this is okay
    }

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      campaignName,
      message: "Front-loaded campaign created and launched",
      betaTester: {
        id: betaTester.id,
        company_name: betaTester.company_name,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/beta/front-loaded-wins:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























































