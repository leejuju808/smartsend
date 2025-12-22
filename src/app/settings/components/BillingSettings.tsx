"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { CreditCard, ExternalLink, TrendingUp } from "lucide-react";

interface BillingData {
  org: {
    id: string;
    name: string;
  };
  subscription: {
    plan: string;
    status: string;
    renewal_date: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  };
  usage: {
    campaigns: number;
    campaign_limit: number;
    emails_sent_this_month: number;
    monthly_email_limit: number;
  };
  portal_url: string | null;
}

export default function BillingSettings({ canEdit }: { canEdit: boolean }) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingData | null>(null);

  useEffect(() => {
    loadBilling();
  }, []);

  const loadBilling = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/settings/billing", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBilling(data);
      }
    } catch (error) {
      console.error("Error loading billing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = () => {
    if (billing?.portal_url) {
      window.open(billing.portal_url, "_blank");
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!billing) {
    return <div className="text-center py-8">Unable to load billing information</div>;
  }

  const planColors: Record<string, string> = {
    Starter: "bg-gray-100 text-gray-800",
    Growth: "bg-blue-100 text-blue-800",
    Domination: "bg-purple-100 text-purple-800",
  };

  const campaignLimitText =
    billing.usage.campaign_limit === -1
      ? "Included"
      : `${billing.usage.campaigns} / ${billing.usage.campaign_limit}`;

  const emailUsagePercent =
    billing.usage.monthly_email_limit > 0
      ? Math.min((billing.usage.emails_sent_this_month / billing.usage.monthly_email_limit) * 100, 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Billing & Subscription</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage your subscription and view usage
        </p>
      </div>

      {/* Current Plan */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Current Plan</h3>
        <div className="flex items-center justify-between">
          <div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                planColors[billing.subscription.plan] || planColors.Starter
              }`}
            >
              {billing.subscription.plan}
            </span>
            {billing.subscription.renewal_date && (
              <p className="text-sm text-gray-500 mt-2">
                Renews on {new Date(billing.subscription.renewal_date).toLocaleDateString()}
              </p>
            )}
          </div>
          {billing.portal_url && (
            <button
              onClick={handleManageSubscription}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Manage Subscription
              <ExternalLink className="h-4 w-4 ml-2" />
            </button>
          )}
        </div>
      </div>

      {/* Usage Stats */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Usage Limits</h3>
        <div className="space-y-6">
          {/* Campaigns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Campaigns</span>
              <span className="text-sm text-gray-500">{campaignLimitText}</span>
            </div>
            {billing.usage.campaign_limit !== -1 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min((billing.usage.campaigns / billing.usage.campaign_limit) * 100, 100)}%`,
                  }}
                />
              </div>
            )}
          </div>

          {/* Monthly Emails */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Monthly Emails</span>
              <span className="text-sm text-gray-500">
                {billing.usage.emails_sent_this_month.toLocaleString()} /{" "}
                {billing.usage.monthly_email_limit === -1
                  ? "Included"
                  : billing.usage.monthly_email_limit.toLocaleString()}
              </span>
            </div>
            {billing.usage.monthly_email_limit > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    emailUsagePercent >= 90 ? "bg-red-600" : emailUsagePercent >= 75 ? "bg-yellow-600" : "bg-green-600"
                  }`}
                  style={{ width: `${emailUsagePercent}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade CTA */}
      {billing.subscription.plan === "Starter" && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Ready to scale?</h3>
              <p className="text-sm text-gray-600">
                Upgrade to Growth or Domination for more campaigns and higher email limits
              </p>
            </div>
            <button
              onClick={handleManageSubscription}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Upgrade Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}






















































