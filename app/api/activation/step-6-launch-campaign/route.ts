import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/step-6-launch-campaign
 * 
 * Step 6: Launch First Campaign (The "Aha Moment")
 * Always start with one of these two:
 * - Campaign 1: "Homeowner Follow-Up Revival" (for any roofer with old leads or referrals)
 * - Campaign 2: "Free Estimate + Inspection" (for roofers wanting new booked appointments fast)
 * 
 * You preview the first email, then launch with them watching.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      campaign_type, // 'homeowner_followup_revival' | 'free_estimate_inspection'
      contact_ids, // Optional: specific contacts to target
      launch_immediately = true, // Launch now or save as draft
    } = body;

    if (!workspace_id || !campaign_type) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, campaign_type" },
        { status: 400 }
      );
    }

    if (!["homeowner_followup_revival", "free_estimate_inspection"].includes(campaign_type)) {
      return NextResponse.json(
        { error: "Invalid campaign_type. Must be homeowner_followup_revival or free_estimate_inspection" },
        { status: 400 }
      );
    }

    // Get activation state
    const { data: activationState, error: activationError } = await supabase
      .from("roofer_activation_state")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (activationError || !activationState) {
      return NextResponse.json(
        { error: "Activation state not found. Complete steps 1-5 first." },
        { status: 404 }
      );
    }

    // Get workspace profile for campaign personalization
    const { data: workspaceProfile } = await supabase
      .from("workspace_profiles")
      .select("company_name, primary_city, company_phone")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const companyName = workspaceProfile?.company_name || activationState.company_name || "Your Roofing Company";
    const city = activationState.primary_city || workspaceProfile?.primary_city || "";

    // Get campaign template based on type
    let templateKey: string;
    let campaignName: string;
    let campaignGoal: string;
    let sequenceSteps: any[];

    if (campaign_type === "homeowner_followup_revival") {
      templateKey = "roofing_old_quote_reactivation";
      campaignName = "Homeowner Follow-Up Revival";
      campaignGoal = "revive_old_leads";
      
      sequenceSteps = [
        {
          step_order: 0,
          subject_template: "Still thinking about your roof estimate in {{city}}?",
          body_template: `Hi {{first_name}},

This is {{company_name}} — we sent you a roof estimate a while back for your place in {{city}}.

Just wanted to check in and see where you're at with things:
- Still comparing quotes?
- Not sure what to do yet?
- Project on hold?

If it would help, we can walk through the estimate again, tweak options, or break it into phases to fit your budget.

Best,
{{sender_name}}
{{company_name}}`,
          delay_days: 0,
        },
        {
          step_order: 1,
          subject_template: "Quick follow-up on your roof estimate",
          body_template: `Hey {{first_name}},

Just circling back in case my last message got buried.

If you still need someone to take a look at your roof, I can get you a free estimate this week.

No pressure — just reply here and I'll get you on the schedule.

– {{sender_name}}`,
          delay_days: 2,
        },
      ];
    } else {
      // free_estimate_inspection
      templateKey = "roofing_free_inspection";
      campaignName = "Free Estimate + Inspection";
      campaignGoal = "book_estimate";
      
      sequenceSteps = [
        {
          step_order: 0,
          subject_template: "Quick question about your roof in {{city}}",
          body_template: `Hey {{first_name}},

I'm {{sender_name}} with {{company_name}} here in {{city}}. We've been helping homeowners in your area with roof inspections and replacements, especially after the last couple seasons of wind and rain.

Right now we're offering a **no-pressure, free roof inspection** for homes in {{city}}. We check for:

- Hidden leaks and soft spots
- Missing or cracked shingles
- Storm and hail damage that could void insurance later

If we find anything, we'll show you photos and a clear estimate. If everything looks good, we'll say so and be on our way.

Would you be open to a quick **10–15 minute inspection** sometime next week?

Best,
{{sender_name}}
{{company_name}}
{{sender_phone}}`,
          delay_days: 0,
        },
        {
          step_order: 1,
          subject_template: "Still happy to check your roof for free",
          body_template: `Hey {{first_name}},

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
          delay_days: 2,
        },
      ];
    }

    // Get sending identity (email account)
    const { data: emailAccount } = await supabase
      .from("email_accounts")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("is_primary", true)
      .maybeSingle();

    if (!emailAccount) {
      return NextResponse.json(
        { error: "No email account configured. Please connect an email account first." },
        { status: 400 }
      );
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id,
        name: campaignName,
        goal: campaignGoal,
        niche: "roofing",
        status: launch_immediately ? "scheduled" : "draft",
        from_email_account_id: emailAccount.id,
        sending_identity_id: emailAccount.id,
        audience_type: contact_ids && contact_ids.length > 0 ? "manual" : "list",
        sequence: sequenceSteps,
        created_by: user.id,
        start_date: launch_immediately ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (campaignError || !campaign) {
      console.error("Campaign creation error:", campaignError);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    // Create campaign steps
    const campaignSteps = sequenceSteps.map((step) => ({
      campaign_id: campaign.id,
      step_no: step.step_order,
      subject_template: step.subject_template,
      body_template: step.body_template,
      delay_days: step.delay_days || 0,
      active: true,
    }));

    await supabase.from("campaign_steps").insert(campaignSteps);

    // Add contacts to campaign if specified
    if (contact_ids && contact_ids.length > 0) {
      const campaignLeads = contact_ids.map((contactId: string) => ({
        campaign_id: campaign.id,
        lead_id: contactId,
      }));

      await supabase.from("campaign_leads").insert(campaignLeads);
    } else {
      // Add all contacts from "Homeowners List" if no specific contacts provided
      const { data: homeownersList } = await supabase
        .from("contact_lists")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("name", "Homeowners List")
        .maybeSingle();

      if (homeownersList) {
        const { data: listMembers } = await supabase
          .from("contact_list_members")
          .select("contact_id")
          .eq("list_id", homeownersList.id);

        if (listMembers && listMembers.length > 0) {
          const campaignLeads = listMembers.map((member) => ({
            campaign_id: campaign.id,
            lead_id: member.contact_id,
          }));

          await supabase.from("campaign_leads").insert(campaignLeads);
        }
      }
    }

    // Update activation state
    const { error: step6Error } = await supabase
      .from("roofer_activation_state")
      .update({
        first_campaign_launched_at: launch_immediately ? new Date().toISOString() : null,
        first_campaign_id: campaign.id,
        first_campaign_type: campaign_type,
        step_completed: launch_immediately ? 6 : 5, // Only mark complete if launched
        activation_completed_at: launch_immediately ? new Date().toISOString() : null,
      })
      .eq("id", activationState.id);

    if (step6Error) {
      console.error("Failed to update step 6:", step6Error);
    }

    // Preview first email
    const firstStep = sequenceSteps[0];
    const previewSubject = firstStep.subject_template.replace(/\{\{city\}\}/g, city);
    const previewBody = firstStep.body_template
      .replace(/\{\{first_name\}\}/g, "{{first_name}}")
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{city\}\}/g, city)
      .replace(/\{\{sender_name\}\}/g, activationState.owner_name || "{{sender_name}}")
      .replace(/\{\{sender_phone\}\}/g, activationState.company_phone || "{{sender_phone}}");

    return NextResponse.json({
      success: true,
      step_completed: launch_immediately ? 6 : 5,
      campaign: {
        id: campaign.id,
        name: campaignName,
        type: campaign_type,
        status: launch_immediately ? "scheduled" : "draft",
      },
      preview: {
        subject: previewSubject,
        body: previewBody,
      },
      message: launch_immediately
        ? "Roofers SEE their system doing work for them. This creates immediate confidence and early wins."
        : "Campaign created. Ready to launch when you are.",
    });
  } catch (error: any) {
    console.error("Error in step-6-launch-campaign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































