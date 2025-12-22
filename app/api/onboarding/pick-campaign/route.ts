// app/api/onboarding/pick-campaign/route.ts
// Block 9200 — Onboarding Flow v1: Step 4 — Pick a Roofing Campaign Recipe
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recipe definitions (matching spec)
const RECIPES = {
  storm_damage: {
    name: "Storm Damage Outreach",
    description: "Reach homeowners after recent storms with free inspection offers",
  },
  tune_up: {
    name: "Roof Tune-Up & Maintenance",
    description: "Prevent leaks and extend roof life before bad weather",
  },
  gutter_bundle: {
    name: "Gutter + Roof Bundle",
    description: "Gutters + roof inspection package offer",
  },
} as const;

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No workspace found" },
      { status: 400 }
    );
  }

  const workspaceId = membership.workspace_id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { recipe } = body;

  if (!recipe || !RECIPES[recipe as keyof typeof RECIPES]) {
    return NextResponse.json(
      { error: `Invalid recipe. Must be one of: ${Object.keys(RECIPES).join(", ")}` },
      { status: 400 }
    );
  }

  // Check campaign limit (Billing Guard)
  const { count: campaignCount } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // For Starter plan, limit is 1 campaign
  // TODO: Get actual plan from billing_accounts/workspaces
  const maxCampaigns = 1; // Default for starter
  if ((campaignCount || 0) >= maxCampaigns) {
    return NextResponse.json(
      {
        error: "campaign_limit_reached",
        message: "You've reached your campaign limit. Upgrade to add more.",
      },
      { status: 402 }
    );
  }

  // Get account profile for campaign name
  const { data: profile } = await supabase
    .from("account_profiles")
    .select("company_name, service_area")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("account_profiles")
    .select("company_name, service_area")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: sendingIdentity } = await supabase
    .from("sending_identities")
    .select("from_name, from_email")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();

  // Get homeowners list
  const { data: homeownersList } = await supabase
    .from("contact_lists")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Homeowners List")
    .maybeSingle();

  if (!homeownersList) {
    return NextResponse.json(
      { error: "Homeowners List not found. Please import leads first." },
      { status: 400 }
    );
  }

  // Create campaign name
  const recipeInfo = RECIPES[recipe as keyof typeof RECIPES];
  const campaignName = profile?.service_area
    ? `${recipeInfo.name} – ${profile.service_area}`
    : recipeInfo.name;

  // Create campaign
  const campaignData: any = {
    workspace_id: workspaceId,
    name: campaignName,
    status: "draft",
    from_name: sendingIdentity?.from_name || null,
    from_email: sendingIdentity?.from_email || null,
    daily_send_limit: 50, // Default
  };

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert(campaignData)
    .select()
    .single();

  if (campaignError) {
    console.error("Error creating campaign:", campaignError);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

  // Get roofing template by recipe key (if exists)
  const { data: template } = await supabase
    .from("roofing_templates")
    .select("id")
    .eq("recommended_for", recipe)
    .limit(1)
    .maybeSingle();

  if (template) {
    // Get template steps
    const { data: steps } = await supabase
      .from("roofing_template_steps")
      .select("*")
      .eq("template_id", template.id)
      .order("step_order", { ascending: true });

    // Create email templates for campaign (if campaign_email_templates table exists)
    // Note: This depends on your email template structure
    if (steps && steps.length > 0) {
      // Try to create email templates
      // Adjust based on your actual schema
      for (const step of steps) {
        // Create campaign step or email template entry
        // This depends on your campaign structure
      }
    }
  }

  // Create follow-up program with default rules (Block 8880)
  const { data: followUpProgram, error: programError } = await supabase
    .from("follow_up_programs")
    .insert({
      account_id: user.id,
      campaign_id: campaign.id,
      is_enabled: true,
      max_follow_ups_per_lead: 4,
      timezone: "America/Los_Angeles",
    })
    .select()
    .single();

  if (programError) {
    console.error("Error creating follow-up program:", programError);
    // Don't fail, just log
  } else {
    // Create default follow-up rules: no-reply after 2, 5, 10 days
    const defaultRules = [
      { no_reply_after_days: 2, priority: 100 },
      { no_reply_after_days: 5, priority: 90 },
      { no_reply_after_days: 10, priority: 80 },
    ];

    for (const rule of defaultRules) {
      await supabase.from("follow_up_rules").insert({
        program_id: followUpProgram.id,
        account_id: user.id,
        type: "no_reply",
        is_enabled: true,
        priority: rule.priority,
        no_reply_after_days: rule.no_reply_after_days,
        stop_all_future: false,
        add_to_suppression: false,
      });
    }

    // Positive intent rule: stop on hot/warm replies
    await supabase.from("follow_up_rules").insert({
      program_id: followUpProgram.id,
      account_id: user.id,
      type: "positive_intent",
      is_enabled: true,
      priority: 200,
      intent_match_any: ["hot", "warm"],
      stop_all_future: true,
      add_to_suppression: false,
    });

    // Negative intent rule: stop on not_interested, unsubscribe
    await supabase.from("follow_up_rules").insert({
      program_id: followUpProgram.id,
      account_id: user.id,
      type: "negative_intent",
      is_enabled: true,
      priority: 200,
      intent_match_any: ["not_interested", "unsubscribe"],
      stop_all_future: true,
      add_to_suppression: true,
    });
  }

  // Link campaign to homeowners list (if campaign_contacts or similar exists)
  // This depends on your campaign-contact linking structure

  // Update workspace onboarding step
  const { error: stepError } = await supabase
    .from("workspaces")
    .update({ onboarding_step: "review_launch" })
    .eq("id", workspaceId);

  if (stepError) {
    console.error("Error updating onboarding step:", stepError);
  }

  return NextResponse.json(
    {
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        recipe,
      },
    },
    { status: 200 }
  );
}

