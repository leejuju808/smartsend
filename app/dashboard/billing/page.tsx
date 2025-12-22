// app/dashboard/billing/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getTrialState } from "@/lib/trial";
import { getPlanStateWithUsage } from "@/lib/planLimits";
import BillingClient from "./_components/BillingClient";
import UsageMeter from "@/components/UsageMeter";

export const metadata: Metadata = {
  title: "Billing · SmartSend",
};

type PlanRow = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  max_campaigns: number | null;
  max_emails_per_month: number | null;
};

type SubscriptionRow = {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

async function loadPlans(): Promise<PlanRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      `
      id,
      name,
      price_cents,
      currency,
      max_campaigns,
      max_emails_per_month
    `
    )
    .order("price_cents", { ascending: true });

  if (error || !data) {
    console.error("Error loading plans:", error);
    return [];
  }

  return data as PlanRow[];
}

async function loadCurrentSubscription(): Promise<SubscriptionRow | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Get user's first workspace from workspace_members
  const { data: wsRows, error: wsError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);

  if (wsError || !wsRows || wsRows.length === 0) {
    console.error("No workspace for user:", wsError);
    return null;
  }

  const workspaceId = wsRows[0].workspace_id as string;

  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select(
      `
      id,
      workspace_id,
      plan_id,
      status,
      current_period_start,
      current_period_end
    `
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("Error loading workspace subscription:", error);
    return null;
  }

  return (data as SubscriptionRow) ?? null;
}

export default async function BillingPage() {
  const [plans, subscription, trial, planState] = await Promise.all([
    loadPlans(),
    loadCurrentSubscription(),
    getTrialState(),
    getPlanStateWithUsage(),
  ]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {trial?.isActive && (
        <p className="text-xs text-blue-600 mb-2">
          Trial: {trial.daysLeft} days remaining.
        </p>
      )}
      {trial?.isExpired && (
        <p className="text-xs text-red-600 mb-2">
          Trial expired — upgrade to continue using SmartSend.
        </p>
      )}
      
      {/* Usage Meters */}
      {planState?.usage && (
        <div className="mb-4">
          <UsageMeter
            label="Campaigns"
            used={planState.usage.campaign.used}
            max={planState.usage.campaign.max}
            percent={planState.usage.campaign.percent}
          />

          <UsageMeter
            label="Emails this month"
            used={planState.usage.email.used}
            max={planState.usage.email.max}
            percent={planState.usage.email.percent}
          />
        </div>
      )}

      <BillingClient plans={plans} subscription={subscription} />
    </div>
  );
}
