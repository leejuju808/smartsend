import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { logActivity } from "@/lib/activity";
import { checkCampaignLimit } from "@/lib/billing/enforcement";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getWorkspaceAndPlan } from "@/lib/getWorkspacePlan";
import { canCreateCampaign } from "@/lib/server/checkPlan";
import type { PlanKey } from "@/lib/server/checkPlan";

type SequenceStep = {
  step: number;
  subject: string;
  body: string;
  delayDays: number; // 0 for first step
};

type CampaignPayload = {
  name: string;
  objective?: string;
  fromEmailAccountId: string;
  sendingIdentityId?: string | null; // Block 12000: Multi-identity sending
  audienceType: "all_leads" | "segment" | "manual";
  segmentId?: string | null;
  sequence: SequenceStep[];
  startDate: string; // ISO date
  dailySendCap?: number | null;
  sendingWindowStart?: string | null; // "08:00"
  sendingWindowEnd?: string | null;   // "17:00"
  timezone?: string | null;
  visibility?: "team" | "private";
};

// MVP Campaign Builder payload (Block 8540)
type MVPCampaignPayload = {
  name: string;
  goal: string;
  sequence: Array<{ subject: string; body: string; delay: number }>;
};

export async function POST(req: NextRequest) {
  // Try MVP format first (Block 8540 - Campaign Builder v1)
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Check if this is MVP format (has goal and sequence array with delay property)
  const isMVPFormat = 
    payload.goal && 
    Array.isArray(payload.sequence) && 
    payload.sequence.length > 0 &&
    payload.sequence[0].hasOwnProperty('delay') &&
    !payload.fromEmailAccountId;

  if (isMVPFormat) {
    // MVP Campaign Builder path (Block 8540)
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { name, goal, sequence } = payload as MVPCampaignPayload;

    if (!name || !goal || !Array.isArray(sequence)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Convert MVP sequence format to internal format
    const formattedSequence = sequence.map((step, index) => ({
      step: index + 1,
      subject: step.subject || "",
      body: step.body || "",
      delayDays: step.delay || 0,
    }));

    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        name,
        goal,
        owner_id: user.id,
        status: "draft",
        sequence: formattedSequence,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating campaign:", error);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    // Mark campaign as created in onboarding
    await supabase
      .from("profiles")
      .update({ onboarding_campaign_created: true })
      .eq("id", user.id);

    return NextResponse.json(data, { status: 201 });
  }

  // Existing complex path
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Block 16700: Upgrade Wall - Check plan-based campaign limits
  try {
    const { planKey, planConfig } = await getWorkspaceAndPlan();
    
    // Count existing active campaigns
    const { data: existing, error: countError } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .in("status", ["draft", "scheduled", "running"]);

    if (!countError) {
      const activeCount = existing?.length || 0;
      
      // Use new upgrade wall check
      if (!canCreateCampaign(planKey as PlanKey, activeCount)) {
        // Block 23720: Record upgrade trigger
        try {
          const { recordUpgradeTrigger } = await import('@/lib/upsell/record-trigger');
          const {
            data: { user: authUser },
          } = await supabase.auth.getUser();
          
          if (authUser) {
            const currentPlan = planKey as 'starter' | 'growth' | 'domination';
            const suggestedPlan = (planKey === 'starter' ? 'growth' : 'domination') as 'growth' | 'domination';
            
            await recordUpgradeTrigger({
              workspaceId,
              userId: authUser.id,
              triggerType: 'campaign_limit_hit',
              currentPlan,
              suggestedPlan,
              triggerData: {
                activeCampaigns: activeCount,
                maxCampaigns: planConfig.maxCampaigns,
              },
            });
          }
        } catch (triggerError) {
          // Non-critical, don't fail the request
          console.error('Error recording upgrade trigger:', triggerError);
        }

        return NextResponse.json(
          {
            error: "upgrade_required",
            reason: "campaign_limit",
            message: `Your ${planConfig.name} plan allows ${planConfig.maxCampaigns} active campaign${
              planConfig.maxCampaigns === 1 ? "" : "s"
            }. Upgrade to create more.`,
            activeCount,
            maxCampaigns: planConfig.maxCampaigns,
            plan: planConfig.name,
          },
          { status: 403 }
        );
      }
    }
  } catch (planError) {
    // If plan check fails, log but don't block (graceful degradation)
    console.error("Plan limit check failed:", planError);
  }

  const body = payload as CampaignPayload;

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Campaign name required" }, { status: 400 });
  }
  if (!body.fromEmailAccountId) {
    return NextResponse.json({ error: "From email account required" }, { status: 400 });
  }
  if (!body.sequence || body.sequence.length === 0) {
    return NextResponse.json({ error: "At least one sequence step required" }, { status: 400 });
  }

  // Get org_id for plan enforcement
  const supabaseAdmin = createSupabaseServer();
  let orgId: string | null = null;

  // Try to get org_id from workspace or user's org membership
  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("org_id")
    .eq("id", workspaceId)
    .single();

  if (workspace?.org_id) {
    orgId = workspace.org_id;
  } else {
    // Fallback: get user's first org from org_memberships
    const { data: orgMember } = await supabaseAdmin
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    orgId = orgMember?.org_id || null;
  }

  // Block 12900: Check permission to create campaigns
  if (orgId) {
    const { checkPermission } = await import("@/src/lib/permissions/block12900");
    const canCreate = await checkPermission(orgId, user.id, "campaign.create");
    if (!canCreate) {
      return NextResponse.json(
        {
          error: "insufficient_permissions",
          message: "You don't have permission to create campaigns. Ask your manager or owner.",
        },
        { status: 403 }
      );
    }
  }

  // Check plan limit for active campaigns (only if activating immediately)
  // For draft campaigns, we'll check when they're activated
  // But if org_id exists, we can still check the limit
  if (orgId) {
    const limitCheck = await checkCampaignLimit(orgId);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: "PLAN_CAMPAIGN_LIMIT_EXCEEDED",
          message: limitCheck.message || "Campaign limit exceeded for your plan",
          currentCount: limitCheck.currentCount,
          maxAllowed: limitCheck.maxAllowed,
          plan: limitCheck.plan,
        },
        { status: 403 }
      );
    }
  }

  // Block 14800: Billing Guard - Check if user can create campaign
  const { checkBillingGuard } = await import("@/lib/billing/guard-v2");
  const billingCheck = await checkBillingGuard(supabase, user.id, 'create_campaign');

  if (!billingCheck.allowed) {
    return NextResponse.json(
      {
        error: "BILLING_LIMIT_REACHED",
        message: billingCheck.reason || "Campaign limit reached for your plan",
        upgradeRequired: billingCheck.upgradeRequired,
        upgradePlan: billingCheck.upgradePlan,
        currentPlan: billingCheck.currentPlan,
        limitReached: billingCheck.limitReached,
      },
      { status: 402 }
    );
  }

  // Check limit BEFORE insert (legacy check)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const limitRes = await fetch(`${appUrl}/api/limits/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      kind: "campaigns",
      delta: 1,
    }),
  });

  const limitJson = await limitRes.json();
  if (limitJson.status === "blocked") {
    return NextResponse.json(
      {
        error: "campaigns_limit",
        message: "You've hit the maximum of 100 campaigns for this workspace.",
      },
      { status: 403 }
    );
  }

  // Ensure from_email_account belongs to workspace
  const { data: fromAccount, error: fromError } = await supabase
    .from("email_accounts")
    .select("id")
    .eq("id", body.fromEmailAccountId)
    .eq("workspace_id", workspaceId)
    .single();

  if (fromError || !fromAccount) {
    return NextResponse.json({ error: "Invalid from email account" }, { status: 400 });
  }

  const timezone = body.timezone ?? "America/Los_Angeles";
  const isShared = body.visibility === "team"; // Default to private (false) unless explicitly team/shared

  const { data: campaign, error: insertError } = await supabase
    .from("campaigns")
    .insert({
      name: body.name.trim(),
      objective: body.objective ?? null,
      status: "draft",
      workspace_id: workspaceId,
      org_id: orgId, // Set org_id for plan enforcement
      from_email_account_id: body.fromEmailAccountId,
      sending_identity_id: body.sendingIdentityId ?? null, // Block 12000: Multi-identity sending
      audience_type: body.audienceType,
      segment_id: body.audienceType === "segment" ? body.segmentId ?? null : null,
      daily_send_cap: body.dailySendCap ?? null,
      sending_window_start: body.sendingWindowStart ?? null,
      sending_window_end: body.sendingWindowEnd ?? null,
      start_date: body.startDate,
      timezone,
      sequence: body.sequence,
      created_by: user.id, // Set creator (profiles.id = auth.users.id typically)
      is_shared: isShared, // private by default (we'll add a toggle in the next slice)
    })
    .select("id")
    .single();

  if (insertError || !campaign) {
    console.error(insertError);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  // Add creator as campaign member with owner role
  await supabase.from("campaign_members").insert({
    campaign_id: campaign.id,
    user_id: user.id,
    role: "owner",
  });

  // Log activity
  await logActivity({
    workspaceId,
    actorId: user.id,
    eventType: "campaign_created",
    description: `Campaign "${body.name.trim()}" created`,
    campaignId: campaign.id,
    metadata: { campaign_name: body.name.trim() },
  }).catch((err) => {
    console.error("Failed to log campaign creation activity:", err);
  });

  return NextResponse.json({
    success: true,
    id: campaign.id,
    next: `/campaigns/${campaign.id}/review`,
  });
}



