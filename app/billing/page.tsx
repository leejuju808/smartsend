/**
 * Block 12000 — SmartSend Billing & Subscription Page
 * 
 * Shows current plan, usage stats, and subscription management options.
 */

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

interface Subscription {
  plan: "starter" | "growth" | "domination";
  status: "active" | "past_due" | "canceled" | "incomplete" | "trialing";
  current_period_end: string | null;
  stripe_subscription_id: string | null;
}

interface UsageStats {
  emails_this_month: number;
  active_campaigns: number;
  max_emails: number;
  max_campaigns: number;
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    loadBillingData();
  }, []);

  async function loadBillingData() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      // Load subscription
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, stripe_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (subError) {
        console.error("Error loading subscription:", subError);
      }

      setSubscription(sub || null);

      // Load usage stats
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Get email usage
      const { data: emailUsage } = await supabase
        .from("email_usage")
        .select("emails_sent")
        .eq("user_id", user.id)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();

      // Get active campaign count
      const { count: campaignCount } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["running", "sending", "active"]);

      // Get plan limits
      const plan = sub?.plan || "starter";
      const { data: limits } = await supabase
        .from("plan_limits")
        .select("max_campaigns, max_emails_per_month")
        .eq("plan", plan)
        .maybeSingle();

      setUsage({
        emails_this_month: emailUsage?.emails_sent || 0,
        active_campaigns: campaignCount || 0,
        max_emails: limits?.max_emails_per_month || 0,
        max_campaigns: limits?.max_campaigns || 0,
      });

      setLoading(false);
    } catch (err: any) {
      console.error("Error loading billing data:", err);
      setError(err.message || "Failed to load billing data");
      setLoading(false);
    }
  }

  async function handleUpgrade(plan: "starter" | "growth" | "domination") {
    setRedirecting(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start checkout");
      }

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Checkout error:", err);
      setError(err.message || "Something went wrong");
      setRedirecting(false);
    }
  }

  async function handleManageSubscription() {
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session-block12000", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to create portal session");
      }

      const data = await res.json();
      if (!data.url) throw new Error("No portal URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Portal error:", err);
      setError(err.message || "Something went wrong");
      setRedirecting(false);
    }
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "active":
      case "trialing":
        return "text-green-500";
      case "past_due":
        return "text-yellow-500";
      case "canceled":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading billing information...</div>
      </div>
    );
  }

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const planName = subscription?.plan
    ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
    : "No Plan";

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your SmartSend subscription and view usage
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Current Plan Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Plan:</span>
            <span className="font-semibold">{planName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Status:</span>
            <span className={`font-semibold ${getStatusColor(subscription?.status || "")}`}>
              {subscription?.status ? subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1) : "Inactive"}
            </span>
          </div>
          {subscription?.current_period_end && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Renews:</span>
              <span className="text-sm">{formatDate(subscription.current_period_end)}</span>
            </div>
          )}
        </div>

        {!isActive && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            Your subscription is inactive. Reactivate to continue sending homeowner outreach.
          </div>
        )}
      </div>

      {/* Usage Stats Section */}
      {usage && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Usage This Month</h2>
          <div className="space-y-4">
            {/* Email Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Homeowners contacted</span>
                <span className="text-sm font-semibold">
                  {usage.emails_this_month} / {usage.max_emails === 999999 ? "—" : usage.max_emails}
                </span>
              </div>
              {usage.max_emails !== 999999 && (
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{
                      width: `${Math.min(100, (usage.emails_this_month / usage.max_emails) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {usage.emails_this_month >= usage.max_emails && usage.max_emails !== 999999 && (
                <p className="mt-2 text-sm text-yellow-600">
                  Contact limit reached for your plan. Upgrade to continue.
                </p>
              )}
            </div>

            {/* Campaign Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Active city outreach</span>
                <span className="text-sm font-semibold">
                  {usage.active_campaigns} / {usage.max_campaigns === 999999 ? "—" : usage.max_campaigns}
                </span>
              </div>
              {usage.max_campaigns !== 999999 && (
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-green-500"
                    style={{
                      width: `${Math.min(100, (usage.active_campaigns / usage.max_campaigns) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {usage.active_campaigns >= usage.max_campaigns && usage.max_campaigns !== 999999 && (
                <p className="mt-2 text-sm text-yellow-600">
                  {subscription?.plan === "starter"
                    ? "Starter plan allows 1 city outreach. Upgrade to Growth for more."
                    : "City outreach limit reached. Upgrade to continue."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {subscription?.plan !== "domination" && (
          <button
            onClick={() => {
              const nextPlan =
                subscription?.plan === "starter" ? "growth" : "domination";
              handleUpgrade(nextPlan);
            }}
            disabled={redirecting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {redirecting ? "Redirecting..." : "Upgrade"}
          </button>
        )}

        {subscription?.stripe_subscription_id && (
          <>
            <button
              onClick={handleManageSubscription}
              disabled={redirecting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {redirecting ? "Redirecting..." : "Manage Subscription"}
            </button>
            <button
              onClick={handleManageSubscription}
              disabled={redirecting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              View Invoices
            </button>
          </>
        )}

        {!subscription && (
          <button
            onClick={() => handleUpgrade("starter")}
            disabled={redirecting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {redirecting ? "Redirecting..." : "Start Subscription"}
          </button>
        )}
      </div>
    </div>
  );
}
