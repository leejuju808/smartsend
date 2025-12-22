import type { ReactNode } from "react";
import { PresenceHeartbeat } from "./PresenceHeartbeat";
import { OnboardingWizardTrigger } from "@/components/onboarding/OnboardingWizardTrigger";
import { UsageBanner } from "@/components/billing/UsageBanner";
import { getPlanState } from "@/lib/planLimits";
import { getTrialState } from "@/lib/trial";
import UpgradeBanner from "@/components/UpgradeBanner";
import TrialExpired from "@/components/TrialExpired";
import { createClient } from "@/lib/supabase/server";
import { LeadDrawerWrapper } from "@/components/leads/LeadDrawerWrapper";

export default async function DashLayout({ children }: { children: ReactNode }) {
  const plan = await getPlanState();
  const trial = await getTrialState();

  // Check if user has an active paid subscription
  // Paid users bypass trial check entirely
  let hasActiveSubscription = false;
  if (plan) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: ws } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (ws) {
        const { data: subscription } = await supabase
          .from("workspace_subscriptions")
          .select("status, plan_id")
          .eq("workspace_id", ws.workspace_id)
          .maybeSingle();

        // Active subscription = status is "active"
        hasActiveSubscription = subscription?.status === "active";
      }
    }
  }

  // If trial expired AND no active paid subscription → lock entire dashboard
  if (trial?.isExpired && !hasActiveSubscription) {
    return (
      <div className="p-6">
        <TrialExpired />
      </div>
    );
  }

  let reason = "";

  if (plan) {
    if (plan.maxCampaigns != null && plan.campaignCount >= plan.maxCampaigns) {
      reason = `You've reached your campaign limit (${plan.maxCampaigns}). Upgrade to create more campaigns.`;
    }

    if (
      !reason &&
      plan.maxEmailsPerMonth != null &&
      plan.emailsUsed >= plan.maxEmailsPerMonth
    ) {
      reason = `You've hit your monthly email cap (${plan.maxEmailsPerMonth.toLocaleString()} emails). Upgrade to send more.`;
    }
  }

  return (
    <LeadDrawerWrapper>
      <PresenceHeartbeat />
      <OnboardingWizardTrigger />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <UsageBanner />
        {trial?.isActive && (
          <div className="mb-4 rounded-xl border border-blue-500 bg-blue-500/10 px-4 py-3 text-xs text-blue-700 shadow-sm">
            {trial.daysLeft} days left in your free trial.
          </div>
        )}
        {reason && <UpgradeBanner reason={reason} />}
      </div>
      {children}
    </LeadDrawerWrapper>
  );
}



