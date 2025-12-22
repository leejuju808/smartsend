// app/api/campaigns/[id]/launch/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { applySegmentFilters } from "@/lib/segments/query-builder";
import type { SegmentRuleNode } from "@/lib/segments/debug";

import { runCampaignReview } from "@/lib/campaigns/review";
import { logActivity } from "@/lib/activity";
import { assertWorkspaceCanSend } from "@/lib/billing/canSend";
import { canSendEmails, incrementEmailUsage } from "@/lib/planUsage";
import { ActivityLogger } from "@/lib/activity-log";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // Verify authentication
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load campaign to check ownership and workspace
  const { data: campaign, error: campaignLoadError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, owner_id, account_id, steps, personalize, subject, body_template, body_html, name")
    .eq("id", params.id)
    .single();

  if (campaignLoadError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check user's role in workspace
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  const userRole = teamMember?.role || workspaceMember?.role;

  // Enforce role-based launch access
  if (!userRole) {
    return NextResponse.json(
      { error: "You are not a member of this workspace" },
      { status: 403 }
    );
  }

  // Read-only cannot launch
  if (userRole === "read_only" || userRole === "viewer") {
    return NextResponse.json(
      { error: "Read-only members cannot launch campaigns" },
      { status: 403 }
    );
  }

  // Members can only launch campaigns they own
  if (userRole === "member") {
    const isCampaignOwner = campaign.owner_id === user.id;

    if (!isCampaignOwner) {
      return NextResponse.json(
        { error: "Members can only launch campaigns they own" },
        { status: 403 }
      );
    }
  }

  // Owners and admins can launch any campaign (already checked above)

  // 🔒 Billing gate — block sends when unpaid / no plan
  const guard = await assertWorkspaceCanSend(campaign.workspace_id);
  if (!guard.canSend) {
    return NextResponse.json(
      {
        error: "billing_blocked",
        reason: guard.reason,
        subscription_status: guard.status,
        plan_id: guard.planId,
      },
      { status: 402 } // Payment Required
    );
  }

  // Parse request body for confirm_risky flag
  let confirmRisky = false;
  try {
    const body = await req.json().catch(() => ({}));
    confirmRisky = body.confirm_risky === true;
  } catch {
    // Body might be empty, that's fine
  }

  // 🔒 Block 11700: Warmup Risk Check
  // Check deliverability risk for the campaign's sending account
  const { data: campaignWithAccount } = await supabase
    .from("campaigns")
    .select("id, account_id, workspace_id")
    .eq("id", params.id)
    .single();

  if (campaignWithAccount?.account_id) {
    const { data: accountRisk } = await supabase
      .from("connected_accounts")
      .select("id, last_risk_score, suggested_daily_limit, email_address, account_email, email")
      .eq("id", campaignWithAccount.account_id)
      .single();

    if (accountRisk?.last_risk_score !== null && accountRisk.last_risk_score !== undefined) {
      const riskScore = accountRisk.last_risk_score;
      const riskLevel = riskScore < 40 ? "high" : riskScore < 70 ? "medium" : "low";

      // Block launch if HIGH RISK and user hasn't confirmed
      if (riskLevel === "high" && !confirmRisky) {
        return NextResponse.json(
          {
            error: "deliverability_risk_high",
            message: "Your current sending setup is high risk for spam. Please fix DNS records and warm up gradually before launching.",
            risk_score: riskScore,
            risk_level: riskLevel,
            suggested_daily_limit: accountRisk.suggested_daily_limit || 50,
            account_email: accountRisk.email_address || accountRisk.account_email || accountRisk.email,
            requires_confirmation: true,
          },
          { status: 400 }
        );
      }

      // Warn for MEDIUM RISK (but allow launch)
      if (riskLevel === "medium" && !confirmRisky) {
        // Log warning but don't block
        console.warn(`Campaign ${params.id} launch with medium risk score: ${riskScore}`);
      }
    }
  }

  // Run campaign review first
  const review = await runCampaignReview(supabase, params.id);

  // Block if review status is "block"
  if (review.status === "block") {
    // Log campaign review blocked to team_activity
    const { data: campaignForLog } = await supabase
      .from("campaigns")
      .select("workspace_id, name")
      .eq("id", params.id)
      .single();
    
    if (campaignForLog) {
      await supabase.rpc("log_team_activity", {
        p_workspace_id: campaignForLog.workspace_id,
        p_user_id: user.id,
        p_campaign_id: params.id,
        p_type: "campaign_review_blocked",
        p_title: `Campaign '${campaignForLog.name}' blocked from launch`,
        p_body: `Blocked by review checks: ${review.checks.filter((c: any) => c.status === "fail").map((c: any) => c.label).join(", ")}`,
        p_metadata: {
          campaign_id: params.id,
          review_status: review.status,
          review_score: review.score,
          blocking_checks: review.checks.filter((c: any) => c.status === "fail"),
        },
      }).catch((err) => {
        console.error("Failed to log campaign review blocked activity:", err);
      });
    }

    return NextResponse.json(
      {
        error: "Campaign not safe to launch",
        review,
        blockingChecks: review.checks.filter((c: any) => c.status === "fail"),
      },
      { status: 400 }
    );
  }

  // Require confirmation if review status is "warn"
  if (review.status === "warn" && !confirmRisky) {
    return NextResponse.json(
      {
        error: "Warnings present; confirmation required",
        review,
        warningChecks: review.checks.filter((c: any) => c.status === "warn"),
      },
      { status: 409 }
    );
  }

  // 1) Load the campaign (already loaded above, but reload with full data)
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return NextResponse.json(
      { error: "campaign_not_found", details: cErr?.message },
      { status: 404 }
    );
  }

  // Prevent relaunch
  if (campaign.status === "running") {
    return NextResponse.json(
      { error: "already_running" },
      { status: 400 }
    );
  }

  // Require scheduled time
  if (!campaign.send_at) {
    return NextResponse.json(
      { error: "missing_send_at" },
      { status: 400 }
    );
  }

  // 2) Load targeting rules (List takes priority over SmartList, then segment)
  let rules = null;
  let audience: Array<{ id: string }> = [];

  // Block 10800: If list_id is set, target contacts from that list
  if ((campaign as any).list_id) {
    const listId = (campaign as any).list_id;
    
    // Verify list belongs to user
    const { data: list, error: listErr } = await supabase
      .from("lists")
      .select("id, user_id")
      .eq("id", listId)
      .eq("user_id", user.id)
      .single();

    if (listErr || !list) {
      return NextResponse.json(
        { error: "list_not_found", details: listErr?.message },
        { status: 404 }
      );
    }

    // Get contacts from this list
    const { data: listContacts, error: lcErr } = await supabase
      .from("list_contacts")
      .select("contact_id, contacts!inner(id, email, first_name, last_name, city, state, zip, user_id)")
      .eq("list_id", listId);

    if (lcErr) {
      return NextResponse.json(
        { error: "failed_to_load_list_contacts", details: lcErr.message },
        { status: 500 }
      );
    }

    // Filter to only contacts belonging to this user
    const userContacts = (listContacts || [])
      .filter((lc: any) => lc.contacts?.user_id === user.id)
      .map((lc: any) => lc.contacts)
      .filter(Boolean);

    // Sync contacts to leads table (create or update)
    const leadIds: string[] = [];
    for (const contact of userContacts) {
      // Check if lead already exists for this email
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("account_id", campaign.account_id)
        .eq("email", contact.email)
        .maybeSingle();

      if (existingLead) {
        leadIds.push(existingLead.id);
      } else {
        // Create new lead from contact
        const { data: newLead, error: leadErr } = await supabase
          .from("leads")
          .insert({
            account_id: campaign.account_id,
            email: contact.email,
            first_name: contact.first_name || null,
            last_name: contact.last_name || null,
            company: null, // Contacts don't have company in Block 10800
            city: contact.city || null,
            state: contact.state || null,
            zip: contact.zip || null,
          })
          .select("id")
          .single();

        if (!leadErr && newLead) {
          leadIds.push(newLead.id);
        }
      }
    }

    audience = leadIds.map((id) => ({ id }));
  } else if (campaign.smartlist_id) {
    // If SmartList is attached, use its AI-generated rules
    const { data: smartlist, error: slErr } = await supabase
      .from("shared_resources")
      .select("llm_rules")
      .eq("id", campaign.smartlist_id)
      .eq("smart", true)
      .single();

    if (slErr) {
      return NextResponse.json(
        { error: "smartlist_lookup_failed", details: slErr.message },
        { status: 500 }
      );
    }

    rules = (smartlist?.llm_rules as SegmentRuleNode | null) ?? null;

    // Select audience using segment filters
    let leadQuery = supabase
      .from("leads")
      .select("id")
      .eq("account_id", campaign.account_id) as any;

    leadQuery = applySegmentFilters(leadQuery, rules);

    const { data: leads, error: leadErr } = await leadQuery;

    if (leadErr) {
      return NextResponse.json(
        { error: "lead_fetch_failed", details: leadErr.message },
        { status: 500 }
      );
    }

    audience = leads ?? [];
  } else if (campaign.segment_id) {
    // Fall back to manual segment rules if no SmartList
    const { data: segment, error: sErr } = await supabase
      .from("segments")
      .select("*")
      .eq("id", campaign.segment_id)
      .eq("account_id", campaign.account_id)
      .single();

    if (sErr) {
      return NextResponse.json(
        { error: "segment_lookup_failed", details: sErr.message },
        { status: 500 }
      );
    }

    rules = (segment.rule ?? segment.conditions ?? null) as SegmentRuleNode | null;

    // Select audience using segment filters
    let leadQuery = supabase
      .from("leads")
      .select("id")
      .eq("account_id", campaign.account_id) as any;

    leadQuery = applySegmentFilters(leadQuery, rules);

    const { data: leads, error: leadErr } = await leadQuery;

    if (leadErr) {
      return NextResponse.json(
        { error: "lead_fetch_failed", details: leadErr.message },
        { status: 500 }
      );
    }

    audience = leads ?? [];
  } else {
    // No targeting specified - return error
    return NextResponse.json(
      { error: "no_targeting_specified", message: "Campaign must have list_id, smartlist_id, or segment_id" },
      { status: 400 }
    );
  }

  if (audience.length === 0) {
    return NextResponse.json(
      { error: "no_audience" },
      { status: 400 }
    );
  }

  // Block 16700: Upgrade Wall - Check plan email send quota before launching
  const requestedCount = audience.length;
  const quotaCheck = await canSendEmails(campaign.workspace_id, requestedCount);
  
  if (!quotaCheck.allowed) {
    // Get plan info for upgrade wall
    let planKey: string = "free";
    let planName = "your plan";
    try {
      const { planKey: pk, planConfig } = await import("@/lib/getWorkspacePlan").then(m => m.getWorkspaceAndPlan());
      planKey = pk;
      planName = planConfig.name;
    } catch {
      // Fallback if plan lookup fails
    }
    
    return NextResponse.json(
      {
        error: "upgrade_required",
        reason: "monthly_email_limit",
        message: quotaCheck.reason || "Email send limit reached",
        remaining: quotaCheck.remaining,
        limit: quotaCheck.limit,
        plan: planName,
      },
      { status: 403 }
    );
  }

  // 4) Load campaign steps (from campaigns.steps jsonb or campaign_steps table)
  let steps: Array<{ step: number; delay_days: number; subject: string; body: string }> = [];
  
  // Try campaigns.steps jsonb first
  if (campaign.steps && Array.isArray(campaign.steps)) {
    steps = campaign.steps.map((s: any) => ({
      step: s.step || s.step_no || 1,
      delay_days: s.delay_days || s.delay || 0,
      subject: s.subject || s.subject_template || "",
      body: s.body || s.body_template || s.body_html_template || "",
    })).filter((s: any) => s.subject && s.body);
  } else {
    // Fallback to campaign_steps table
    const { data: campaignSteps } = await supabase
      .from("campaign_steps")
      .select("step_no, delay_days, delay_hours, subject, body, subject_template, body_template, body_html_template")
      .eq("campaign_id", campaign.id)
      .order("step_no", { ascending: true });
    
    if (campaignSteps && campaignSteps.length > 0) {
      steps = campaignSteps.map((s: any) => ({
        step: s.step_no || 1,
        delay_days: s.delay_days || (s.delay_hours ? Math.floor(s.delay_hours / 24) : 0),
        subject: s.subject || s.subject_template || "",
        body: s.body || s.body_template || s.body_html_template || "",
      })).filter((s: any) => s.subject && s.body);
    }
  }

  // If no steps found, create a default step 1
  if (steps.length === 0) {
    steps = [{
      step: 1,
      delay_days: 0,
      subject: campaign.subject || campaign.name || "Follow up",
      body: campaign.body_template || campaign.body_html || "",
    }];
  }

  // 5) Build send_queue entries for each lead × step
  const now = new Date();
  const rows: Array<{
    campaign_id: string;
    lead_id: string;
    step: number;
    scheduled_for: string;
    status: string;
  }> = [];

  for (const lead of audience) {
    let cumulativeDelayDays = 0;
    
    for (const stepDef of steps) {
      // Calculate scheduled_for = now + cumulative delay
      const scheduledFor = new Date(now);
      scheduledFor.setDate(scheduledFor.getDate() + cumulativeDelayDays);
      
      rows.push({
        campaign_id: campaign.id,
        lead_id: lead.id,
        step: stepDef.step,
        scheduled_for: scheduledFor.toISOString(),
        status: "pending",
      });

      // Add this step's delay to cumulative delay for next step
      cumulativeDelayDays += stepDef.delay_days;
    }
  }

  // Insert in batches of 500
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from("send_queue").insert(slice);
    if (error) {
      return NextResponse.json(
        { error: "queue_build_failed", details: error.message },
        { status: 500 }
      );
    }
  }

  // Block 15000: Reserve email usage (increment before marking as running)
  await incrementEmailUsage(campaign.workspace_id, requestedCount).catch((err) => {
    console.error("Failed to increment email usage:", err);
    // Don't block launch if usage increment fails, but log it
  });

  // 5) Mark campaign as running
  const { error: upErr } = await supabase
    .from("campaigns")
    .update({ status: "running" })
    .eq("id", campaign.id);

  if (upErr) {
    return NextResponse.json(
      { error: "status_update_failed", details: upErr.message },
      { status: 500 }
    );
  }

  // 6) Kick off edge function for actual sending
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-runner`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ campaignId: campaign.id }),
  });

  // Log campaign launch to team_activity
  await supabase.rpc("log_team_activity", {
    p_workspace_id: campaign.workspace_id,
    p_user_id: user.id,
    p_campaign_id: campaign.id,
    p_type: "campaign_launched",
    p_title: `Campaign '${campaign.name}' launched by ${user.email || "User"}`,
    p_metadata: {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      queued_count: rows.length,
    },
  }).catch((err) => {
    console.error("Failed to log campaign launch activity:", err);
  });

  // Log to workspace_activity
  await logActivity({
    workspaceId: campaign.workspace_id,
    actorId: user.id,
    eventType: "campaign_launched",
    description: `Campaign "${campaign.name}" launched`,
    campaignId: campaign.id,
    metadata: { campaign_name: campaign.name, queued_count: rows.length },
  }).catch((err) => {
    console.error("Failed to log campaign launch to workspace_activity:", err);
  });

  // Log to Activity Log
  try {
    await ActivityLogger.campaignLaunched({
      workspace_id: campaign.workspace_id,
      user_id: user.id,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      contact_count: rows.length,
    });
  } catch (logError) {
    console.warn("Failed to log campaign launch to activity log:", logError);
  }

  // Block 15600: Auto-mark first_campaign_done when campaign is launched
  const { data: currentWorkspace } = await supabase
    .from("workspaces")
    .select("onboarding_state")
    .eq("id", campaign.workspace_id)
    .single();

  const currentState = currentWorkspace?.onboarding_state || {
    profile_done: false,
    contacts_done: false,
    first_campaign_done: false,
  };

  const newState = {
    ...currentState,
    first_campaign_done: true,
  };

  const allDone =
    newState.profile_done &&
    newState.contacts_done &&
    newState.first_campaign_done;

  await supabase
    .from("workspaces")
    .update({
      onboarding_state: newState,
      onboarding_completed_at: allDone ? new Date().toISOString() : null,
    })
    .eq("id", campaign.workspace_id);

  return NextResponse.json({
    ok: true,
    queued: rows.length,
    campaignId: campaign.id,
    warning:
      quotaCheck.willExceed && quotaCheck.remaining != null
        ? `This send uses a big chunk of your remaining ${quotaCheck.remaining} emails this month.`
        : null,
  });
}