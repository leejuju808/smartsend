'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Zap, Check } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { BillingBanner } from '@/components/billing/BillingBanner';

interface BillingData {
  orgId: string;
  plan: string;
  subscriptionStatus: string;
  emailsSentThisPeriod: number;
  monthlyEmailLimit: number;
  campaignCount: number;
  maxCampaigns: number | null;
  periodRenewsAt: string | null;
  gracePeriodEndsAt: string | null;
  portalUrl: string | null;
}

const PLAN_LIMITS = {
  starter: {
    name: 'Starter',
    price: '$99/mo',
    campaigns: 1,
    emails: 500,
    dailyCap: 50,
  },
  growth: {
    name: 'Growth',
    price: '$199/mo',
    campaigns: 3,
    emails: 2000,
    dailyCap: 150,
  },
  domination: {
    name: 'Domination',
    price: '$399/mo',
    campaigns: null, // no cap
    emails: 10000,
    dailyCap: 400,
  },
};

export default function BillingPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'growth' | 'domination'>('growth');

  useEffect(() => {
    loadBilling();
  }, []);

  const loadBilling = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's org
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!orgMember?.org_id) {
        setLoading(false);
        return;
      }

      const orgId = orgMember.org_id;

      // Get org billing info
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();

      if (!org) {
        setLoading(false);
        return;
      }

      // Get plan limits
      const { data: limits } = await supabase.rpc('get_plan_limits_v2', {
        p_plan: org.plan_tier || 'starter',
      });

      // Get billing info
      const { data: billingInfo } = await supabase.rpc('get_org_billing_info', {
        p_org_id: orgId,
      });

      const billingData = billingInfo?.[0];

      // Get Stripe portal URL
      let portalUrl: string | null = null;
      if (org.billing_customer_id) {
        try {
          const response = await fetch('/api/stripe/create-portal-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId }),
          });
          const data = await response.json();
          portalUrl = data.url || null;
        } catch (error) {
          console.error('Failed to get portal URL:', error);
        }
      }

      setBilling({
        orgId,
        plan: org.plan_tier || 'starter',
        subscriptionStatus: org.subscription_status || 'active',
        emailsSentThisPeriod: org.emails_sent_this_period || 0,
        monthlyEmailLimit: limits?.[0]?.monthly_email_limit || 500,
        campaignCount: org.campaign_count || 0,
        maxCampaigns: limits?.[0]?.max_active_campaigns || 1,
        periodRenewsAt: org.period_renews_at || billingData?.current_period_end || null,
        gracePeriodEndsAt: org.lockout_grace_period_ends_at || null,
        portalUrl,
      });
    } catch (error) {
      console.error('Error loading billing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = (plan: 'growth' | 'domination') => {
    setSelectedPlan(plan);
    setShowUpgradeModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">Loading billing information...</div>
        </div>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-500">Unable to load billing information.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentPlanInfo = PLAN_LIMITS[billing.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.starter;
  const emailUsagePercent = Math.min(
    (billing.emailsSentThisPeriod / billing.monthlyEmailLimit) * 100,
    100
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="mt-2 text-gray-600">Manage your plan, view usage, and upgrade</p>
        </div>

        <BillingBanner
          subscriptionStatus={billing.subscriptionStatus}
          gracePeriodEndsAt={billing.gracePeriodEndsAt}
        />

        {/* Current Plan */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Current Plan</h2>
            {billing.portalUrl && (
              <a
                href={billing.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Manage Subscription
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-lg font-semibold ${
              billing.plan === 'starter' ? 'bg-gray-100 text-gray-800' :
              billing.plan === 'growth' ? 'bg-blue-100 text-blue-800' :
              'bg-purple-100 text-purple-800'
            }`}>
              {currentPlanInfo.name}
            </div>
            <div className="text-gray-600">
              {currentPlanInfo.price}
            </div>
            {billing.periodRenewsAt && (
              <div className="text-sm text-gray-500">
                Renews on {new Date(billing.periodRenewsAt).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Status: <span className="capitalize font-medium">{billing.subscriptionStatus}</span>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage</h2>

          {/* Email Usage */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Emails Sent This Month</span>
              <span className="text-sm text-gray-600">
                {billing.emailsSentThisPeriod} / {billing.monthlyEmailLimit}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  emailUsagePercent >= 90 ? 'bg-red-500' :
                  emailUsagePercent >= 75 ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${emailUsagePercent}%` }}
              />
            </div>
            {emailUsagePercent >= 90 && (
              <p className="mt-2 text-sm text-yellow-600">
                You're approaching your monthly limit. Consider upgrading to send more emails.
              </p>
            )}
          </div>

          {/* Campaign Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Active Campaigns</span>
              <span className="text-sm text-gray-600">
                {billing.campaignCount} / {billing.maxCampaigns === null ? 'Included' : billing.maxCampaigns}
              </span>
            </div>
            {billing.maxCampaigns !== null && billing.campaignCount >= billing.maxCampaigns && (
              <p className="mt-2 text-sm text-yellow-600">
                You've reached your campaign limit. Upgrade to create more campaigns.
              </p>
            )}
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Upgrade Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['growth', 'domination'] as const).map((planKey) => {
              const plan = PLAN_LIMITS[planKey];
              const isCurrentPlan = billing.plan === planKey;

              return (
                <div
                  key={planKey}
                  className={`border-2 rounded-lg p-4 ${
                    isCurrentPlan
                      ? 'border-gray-300 bg-gray-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <span className="text-xl font-bold">{plan.price}</span>
                  </div>
                  {isCurrentPlan ? (
                    <div className="text-sm text-gray-500">Current Plan</div>
                  ) : (
                    <>
                      <ul className="space-y-2 mb-4 text-sm text-gray-600">
                        <li className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span>
                            {plan.campaigns === null ? 'Included' : plan.campaigns} campaigns
                          </span>
                        </li>
                        <li className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{plan.emails.toLocaleString()} emails/month</span>
                        </li>
                        <li className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{plan.dailyCap} emails/day safety cap</span>
                        </li>
                      </ul>
                      <button
                        onClick={() => handleUpgrade(planKey)}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Upgrade to {plan.name}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={billing.plan}
          orgId={billing.orgId}
        />
      )}
    </div>
  );
}
