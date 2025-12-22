import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CampaignStep = {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
};

type TargetingConfig = {
  city?: string;
  daily_limit?: number;
  send_days?: string[]; // ["mon","tue","wed","thu","fri"]
};

// Helper: fetch plan limits for a user
async function getPlanLimitsForUser(supabase: any, userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("Profile/plan_tier not found");
  }

  const tier = profile.plan_tier || "starter";

  const { data: limits, error: limitsError } = await supabase
    .from("plan_limits")
    .select("*")
    .eq("tier", tier)
    .maybeSingle();

  if (limitsError || !limits) {
    throw new Error("Plan limits not configured");
  }

  return { tier, limits };
}

// Helper: schedule calculator that respects daily limits and send days
function buildSendDatePlanner(targeting: TargetingConfig) {
  const sendDays = targeting.send_days?.length
    ? targeting.send_days
    : ["mon", "tue", "wed", "thu", "fri"];
  const dailyLimit = targeting.daily_limit || 40;

  const scheduledCounts = new Map<string, number>();

  const dayCode = (d: Date) => {
    const idx = d.getUTCDay(); // 0-6
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][idx];
  };

  return function getNextSlot(baseDate: Date): Date {
    const d = new Date(baseDate);

    while (true) {
      const code = dayCode(d);

      if (!sendDays.includes(code)) {
        d.setUTCDate(d.getUTCDate() + 1);
        continue;
      }

      const key = d.toISOString().slice(0, 10);
      const count = scheduledCounts.get(key) ?? 0;

      if (count >= dailyLimit) {
        d.setUTCDate(d.getUTCDate() + 1);
        continue;
      }

      // Reserve a slot and set send time ~15:00 UTC (adjust later if needed)
      scheduledCounts.set(key, count + 1);
      d.setUTCHours(15, 0, 0, 0);
      return d;
    }
  };
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load user's plan limits
    const { tier, limits } = await getPlanLimitsForUser(supabase, user.id);

    const body = await req.json();
    const { template_id, targeting, personalize } = body;

    if (!template_id || !targeting || !personalize) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1) Get template
    const { data: template, error: templateError } = await supabase
      .from("campaign_templates")
      .select("*")
      .eq("id", template_id)
      .maybeSingle();

    if (!template || templateError) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // 2) Get template steps
    const { data: templateSteps, error: stepsError } = await supabase
      .from("campaign_template_steps")
      .select("*")
      .eq("template_id", template_id)
      .order("step_order", { ascending: true });

    if (stepsError) {
      console.error("Error fetching template steps:", stepsError);
      return NextResponse.json(
        { error: "Failed to load template steps" },
        { status: 400 }
      );
    }

    // 3) Get user's workspace_id if available
    let workspaceId: string | null = null;
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (workspaceMember) {
      workspaceId = workspaceMember.workspace_id;
    }

    // 4) Get org_id if available
    let orgId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.current_org_id) {
      orgId = profile.current_org_id;
    }

    // 5) Enforce max active campaigns (after workspaceId is determined)
    // Check campaigns by user_id OR by workspace_id (if user is a member)
    let activeCampaignsQuery = supabase
      .from("campaigns")
      .select("id")
      .in("status", ["scheduled", "running", "paused"]);

    // If user has a workspace, check campaigns in that workspace OR campaigns owned by user
    if (workspaceId) {
      activeCampaignsQuery = activeCampaignsQuery.or(`workspace_id.eq.${workspaceId},user_id.eq.${user.id}`);
    } else {
      activeCampaignsQuery = activeCampaignsQuery.eq("user_id", user.id);
    }

    const { data: activeCampaigns, error: activeError } = await activeCampaignsQuery;

    if (activeError) {
      console.error("Active campaigns error:", activeError);
      return NextResponse.json(
        { error: "Could not verify campaign count" },
        { status: 400 }
      );
    }

    if ((activeCampaigns?.length ?? 0) >= limits.max_campaigns) {
      return NextResponse.json(
        {
          error: `Your ${tier} plan allows up to ${limits.max_campaigns} active campaign(s).`,
        },
        { status: 403 }
      );
    }

    // 6) Clamp daily_limit in targeting to plan max
    const safeTargeting = {
      ...targeting,
      daily_limit: Math.min(
        targeting?.daily_limit || limits.max_daily_limit,
        limits.max_daily_limit
      ),
    };

    // 7) Convert template steps to sequence format
    const sequence =
      templateSteps?.map((step: any) => ({
        step: step.step_order,
        subject: step.subject_template,
        body: step.body_template,
        delayDays: step.delay_days || 0,
      })) || [];

    // 8) Create campaign record (use safeTargeting instead of targeting)
    const campaignData: any = {
      name: template.name,
      goal: template.goal || "book_estimates",
      niche: template.niche || "roofing",
      targeting: safeTargeting,
      personalize: personalize,
      sequence: sequence,
      status: "scheduled",
    };

    // Use workspace_id if available, otherwise use user_id
    if (workspaceId) {
      campaignData.workspace_id = workspaceId;
    } else {
      campaignData.user_id = user.id;
    }

    // Add org_id if available
    if (orgId) {
      campaignData.org_id = orgId;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert(campaignData)
      .select("id, targeting")
      .single();

    if (campaignError) {
      console.error("Campaign launch error:", campaignError);
      return NextResponse.json(
        { error: "Launch failed", details: campaignError.message },
        { status: 400 }
      );
    }

    if (!campaign?.id) {
      return NextResponse.json(
        { error: "Campaign creation failed" },
        { status: 400 }
      );
    }

    // 9) Create campaign_steps from template steps
    if (templateSteps && templateSteps.length > 0) {
      const campaignSteps = templateSteps.map((step: any) => ({
        campaign_id: campaign.id,
        step_no: step.step_order,
        subject_template: step.subject_template,
        body_template: step.body_template,
        delay_days: step.delay_days || 0,
        active: true,
      }));

      const { error: stepsInsertError } = await supabase
        .from("campaign_steps")
        .insert(campaignSteps);

      if (stepsInsertError) {
        console.error("Error creating campaign steps:", stepsInsertError);
        // Don't fail the whole launch if steps fail - campaign is created
      }
    }

    // 10) Fetch leads attached to this campaign
    const { data: campaignLeads, error: leadsError } = await supabase
      .from("campaign_leads")
      .select("lead_id")
      .eq("campaign_id", campaign.id);

    if (leadsError) {
      console.error("campaign_leads error:", leadsError);
      return NextResponse.json(
        { error: "Lead fetch failed" },
        { status: 400 }
      );
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      return NextResponse.json(
        { error: "No leads attached to this campaign." },
        { status: 400 }
      );
    }

    // 11) Prepare steps for queue generation
    const steps: CampaignStep[] = (templateSteps || [])
      .sort((a: any, b: any) => a.step_order - b.step_order)
      .map((step: any) => ({
        step: step.step_order,
        delay_days: step.delay_days || 0,
        subject: step.subject_template,
        body: step.body_template,
      }));

    if (!steps.length) {
      return NextResponse.json(
        { error: "Campaign has no steps defined." },
        { status: 400 }
      );
    }

    // 12) Build send dates respecting daily limit + send days
    // Use safeTargeting (already clamped to plan limits) from campaign.targeting
    const targetingConfig: TargetingConfig = campaign.targeting || safeTargeting || {};
    const getNextSlot = buildSendDatePlanner(targetingConfig);

    // Start base scheduling from tomorrow
    const baseStart = new Date();
    baseStart.setUTCDate(baseStart.getUTCDate() + 1);
    baseStart.setUTCHours(15, 0, 0, 0);

    const queueRows: any[] = [];

    for (const row of campaignLeads) {
      const leadId = row.lead_id;

      for (const step of steps) {
        // For each step, add its delay_days to the base date
        const baseForStep = new Date(baseStart);
        baseForStep.setUTCDate(
          baseForStep.getUTCDate() + (step.delay_days ?? 0)
        );

        const sendAt = getNextSlot(baseForStep);

        queueRows.push({
          campaign_id: campaign.id,
          lead_id: leadId,
          step: step.step,
          scheduled_for: sendAt.toISOString(),
          status: "pending",
        });
      }
    }

    // 13) Bulk insert into send_queue
    if (queueRows.length > 0) {
      const { error: queueInsertError } = await supabase
        .from("send_queue")
        .insert(queueRows);

      if (queueInsertError) {
        console.error("send_queue insert error:", queueInsertError);
        return NextResponse.json(
          { error: "Queue generation failed", details: queueInsertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      status: "ok",
      campaign_id: campaign.id,
    });
  } catch (error: any) {
    console.error("Campaign launch error:", error);
    return NextResponse.json(
      { error: "Launch failed", details: error.message },
      { status: 500 }
    );
  }
}

