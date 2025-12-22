import { createClient } from "@/lib/supabase/server";
import { isUserActive } from "./isUserActive";
import { getCampaignWithAccess } from "./getCampaignWithAccess";

export type LaunchIssueLevel = "ok" | "warning" | "error";

export type LaunchIssue = {
  level: LaunchIssueLevel;
  code: string;
  message: string;
};

export type LaunchReadiness = {
  canLaunch: boolean;
  issues: LaunchIssue[];
};

export async function getCampaignLaunchReadiness(
  campaignId: string
): Promise<LaunchReadiness> {
  const supabase = createClient();
  const issues: LaunchIssue[] = [];

  // 1) Auth + subscription
  const { active, user } = await isUserActive();
  if (!user) {
    issues.push({
      level: "error",
      code: "not_authenticated",
      message: "You must be logged in.",
    });
    return { canLaunch: false, issues };
  }

  if (!active) {
    issues.push({
      level: "error",
      code: "no_subscription",
      message: "You need an active SmartSend subscription to start campaigns.",
    });
  }

  // 2) Campaign + sending account (check access)
  const { campaign: campaignAccess, role } = await getCampaignWithAccess(campaignId);

  if (!campaignAccess) {
    issues.push({
      level: "error",
      code: "campaign_not_found",
      message: "Campaign not found.",
    });
    return { canLaunch: false, issues };
  }

  if (role === "none" || role === "viewer") {
    issues.push({
      level: "error",
      code: "no_permission",
      message: "You don't have permission to launch this campaign.",
    });
    return { canLaunch: false, issues };
  }

  // Fetch campaign with all needed fields
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select(
      "id, name, status, sending_account_id, user_id, total_sent, total_replies, total_opens, total_clicks"
    )
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    issues.push({
      level: "error",
      code: "campaign_not_found",
      message: "Campaign not found.",
    });
    return { canLaunch: false, issues };
  }

  if (campaign.status === "running") {
    issues.push({
      level: "warning",
      code: "already_running",
      message: "This campaign is already running.",
    });
  }

  if (!campaign.sending_account_id) {
    issues.push({
      level: "error",
      code: "no_sending_account",
      message: "Select a sending account before starting this campaign.",
    });
  }

  let account: any = null;
  if (campaign.sending_account_id) {
    const { data: acc } = await supabase
      .from("smartsend_sending_accounts")
      .select("*")
      .eq("id", campaign.sending_account_id)
      .maybeSingle();
    account = acc;

    if (!acc) {
      issues.push({
        level: "error",
        code: "sending_account_missing",
        message: "The selected sending account no longer exists.",
      });
    } else {
      if (acc.status === "error") {
        issues.push({
          level: "error",
          code: "sending_account_error",
          message:
            "The selected sending account is in error state. Reconnect it in Settings → Sending Accounts.",
        });
      }
      if (acc.status === "throttled") {
        issues.push({
          level: "warning",
          code: "sending_account_throttled",
          message:
            "This sending account is currently throttled for today. New emails will be delayed until limits reset.",
        });
      }
    }
  }

  // 3) Steps - try to get steps with flexible column names
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("id, step_index, step_no, step_number, position, subject, subject_template, body, body_html, body_html_template, body_text, delay_days, delay_hours, delay_minutes")
    .eq("campaign_id", campaignId);

  // Order by whichever position column exists
  let orderedSteps = steps || [];
  if (orderedSteps.length > 0) {
    orderedSteps = orderedSteps.sort((a: any, b: any) => {
      const aPos = a.position ?? a.step_index ?? a.step_no ?? a.step_number ?? 0;
      const bPos = b.position ?? b.step_index ?? b.step_no ?? b.step_number ?? 0;
      return aPos - bPos;
    });
  }

  if (!orderedSteps || orderedSteps.length === 0) {
    issues.push({
      level: "error",
      code: "no_steps",
      message: "Add at least one sequence step before starting.",
    });
  }

  // 4) Leads (sendable)
  // Try direct campaign_id first, then check campaign_leads join table
  const { data: leadsAgg } = await supabase
    .from("leads")
    .select("status, do_not_contact", { count: "exact", head: false })
    .eq("campaign_id", campaignId);

  let totalLeads = leadsAgg?.length ?? 0;
  let sendableLeads = (leadsAgg || []).filter(
    (l: any) => !l.do_not_contact && (l.status === "pending" || l.status === "new" || l.status === "queued")
  ).length;

  // If no leads found via direct campaign_id, check campaign_leads join table
  if (totalLeads === 0) {
    const { data: campaignLeads } = await supabase
      .from("campaign_leads")
      .select("lead_id, status")
      .eq("campaign_id", campaignId);

    if (campaignLeads && campaignLeads.length > 0) {
      const leadIds = campaignLeads.map((cl: any) => cl.lead_id).filter(Boolean);
      if (leadIds.length > 0) {
        const { data: leadsFromJoin } = await supabase
          .from("leads")
          .select("id, status, do_not_contact")
          .in("id", leadIds);

        totalLeads = leadsFromJoin?.length ?? 0;
        sendableLeads = (leadsFromJoin || []).filter(
          (l: any) => !l.do_not_contact && (l.status === "pending" || l.status === "new" || l.status === "queued")
        ).length;
      }
    }
  }

  if (totalLeads === 0) {
    issues.push({
      level: "error",
      code: "no_leads",
      message: "This campaign has no leads yet. Import leads before starting.",
    });
  } else if (sendableLeads === 0) {
    issues.push({
      level: "error",
      code: "no_sendable_leads",
      message:
        "All leads are either completed, replied, or marked do-not-contact. Import new leads to continue.",
    });
  }

  // 5) Safety sanity check: leads vs daily_limit
  if (account && sendableLeads > 0) {
    const dailyLimit = account.daily_limit || 400;
    if (sendableLeads > dailyLimit * 3) {
      issues.push({
        level: "warning",
        code: "large_lead_volume",
        message: `This campaign has ${sendableLeads} sendable leads, which is high versus your daily limit of ${dailyLimit}. SmartSend will throttle sends automatically, but consider adding more mailboxes or lowering daily volume.`,
      });
    }
  }

  // Compute canLaunch: no ERROR-level issues
  const hasError = issues.some((i) => i.level === "error");
  const canLaunch = !hasError;

  return { canLaunch, issues };
}

