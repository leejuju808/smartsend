import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/campaigns/[id]/publish - Publish a campaign (starts the sequence)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id: campaignId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify campaign exists and user has access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, name, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get workspace plan for feature gating
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("plan_key, email_limit_monthly, email_used_this_period")
    .eq("id", campaign.workspace_id)
    .single();

  // Check if campaign has steps
  const { data: steps, error: stepsError } = await supabase
    .from("campaign_steps")
    .select("id")
    .eq("campaign_id", campaignId)
    .limit(1);

  if (stepsError) {
    return NextResponse.json(
      { error: "Failed to check steps", details: stepsError.message },
      { status: 500 }
    );
  }

  if (!steps || steps.length === 0) {
    return NextResponse.json(
      { error: "Campaign must have at least one step before publishing" },
      { status: 400 }
    );
  }

  // Feature gating: Check sequence limits based on plan
  const planKey = workspace?.plan_key || "starter";
  const { data: publishedCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("status", "published");

  const publishedCount = publishedCampaigns?.length || 0;

  // Plan limits: Starter 1, Growth 3, Domination unlimited
  const planLimits: Record<string, number> = {
    starter: 1,
    growth: 3,
    domination: 999999,
  };

  const maxSequences = planLimits[planKey] || 1;

  if (publishedCount >= maxSequences && campaign.status !== "published") {
    return NextResponse.json(
      {
        error: "upgrade_required",
        reason: "sequence_limit",
        message: `Your ${planKey} plan allows ${maxSequences} active sequence${
          maxSequences === 1 ? "" : "s"
        }. Upgrade to create more.`,
        publishedCount,
        maxSequences,
        plan: planKey,
      },
      { status: 403 }
    );
  }

  // Check email volume limits
  const emailLimit = workspace?.email_limit_monthly || 500;
  const emailUsed = workspace?.email_used_this_period || 0;

  if (emailUsed >= emailLimit) {
    return NextResponse.json(
      {
        error: "upgrade_required",
        reason: "email_limit",
        message: `You've reached your monthly email limit (${emailLimit}). Upgrade to send more.`,
        emailUsed,
        emailLimit,
        plan: planKey,
      },
      { status: 403 }
    );
  }

  // Get first step to initialize sequence
  const { data: firstStep } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStep) {
    return NextResponse.json(
      { error: "Campaign must have at least one step" },
      { status: 400 }
    );
  }

  // Get leads for this campaign
  const { data: leads } = await supabase
    .from("leads")
    .select("email, id")
    .eq("campaign_id", campaignId)
    .limit(1000); // Limit to prevent overwhelming the system

  // Initialize sequence logs for all leads
  if (leads && leads.length > 0) {
    const logs = leads.map((lead) => ({
      campaign_id: campaignId,
      step_id: firstStep.id,
      lead_id: lead.id,
      contact_email: lead.email,
      status: "pending" as const,
      scheduled_time: new Date().toISOString(), // Start immediately
    }));

    // Insert in batches of 100
    for (let i = 0; i < logs.length; i += 100) {
      const batch = logs.slice(i, i + 100);
      const { error: logsError } = await supabase
        .from("campaign_logs")
        .insert(batch);

      if (logsError) {
        console.error("Error initializing logs:", logsError);
        // Continue anyway - logs can be created on-demand
      }
    }
  }

  // Update campaign status to published
  const { data: updatedCampaign, error: updateError } = await supabase
    .from("campaigns")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to publish campaign", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    campaign: updatedCampaign,
    message: "Campaign published successfully",
    leadsEnrolled: leads?.length || 0,
  });
}

