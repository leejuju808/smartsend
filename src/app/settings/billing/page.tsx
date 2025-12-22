/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Billing settings page with plan details, usage, and upgrade options
 */

'use client';

import { useEffect, useState } from 'react';
import { BillingGuardV2 } from '@/components/billing/BillingGuardV2';

interface BillingData {
  usage: {
    emailsSentThisMonth: number;
    campaignsCreated: number;
    seatsUsed: number;
    plan: string;
    limits: {
      maxCampaigns: number;
      maxEmailsPerMonth: number;
      maxSeats: number;
      hasAdvancedAI: boolean;
      hasRevenueDashboard: boolean;
      hasAdvancedAutomation: boolean;
    };
  };
  billingStatus: {
    billingStatus: string;
    canSend: boolean;
    canSchedule: boolean;
    canUseInbox: boolean;
    canCreateCampaigns: boolean;
    trialExpired: boolean;
    daysUntilTrialExpires: number;
  };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    isTrialActive: boolean;
  };
  upsellTriggers: Array<{
    type: string;
    message: string;
    upgradePlan: string;
    urgency: string;
  }> | null;
}

const PLANS = {
  starter: {
    name: 'Starter',
    price: 99,
    features: [
      '1 campaign',
      '500 emails/month',
      'Basic AI personalization',
      'Reply monitoring',
    ],
  },
  growth: {
    name: 'Growth',
    price: 199,
    features: [
      '3 campaigns',
      '2,000 emails/month',
      'Advanced AI sequences',
      'Storm + insurance upgrades',
      '2 seats',
      'Priority support',
    ],
  },
  domination: {
    name: 'Domination',
    price: 399,
    features: [
      'High-volume campaigns',
      '10,000 emails/month',
      'Full automation',
      'Revenue dashboard',
      '5 seats',
      'Priority support',
      'VIP onboarding',
    ],
  },
};

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/billing/usage')
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching billing data:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Billing</h1>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Billing</h1>
          <div className="text-red-600">Error loading billing data</div>
        </div>
      </div>
    );
  }

  const { usage, billingStatus, subscription } = data;
  const currentPlan = PLANS[subscription.plan as keyof typeof PLANS];

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Billing & Usage</h1>

        <BillingGuardV2 />

        {/* Current Plan */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">{currentPlan?.name || subscription.plan}</h3>
              <p className="text-gray-600 mt-1">
                ${currentPlan?.price}/month
              </p>
              {subscription.isTrialActive && (
                <p className="text-sm text-yellow-600 mt-2">
                  Trial expires in {billingStatus.daysUntilTrialExpires} day
                  {billingStatus.daysUntilTrialExpires > 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Status</div>
              <div className={`font-semibold ${
                subscription.status === 'active' ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {subscription.status === 'active' ? 'Active' : subscription.status}
              </div>
              {subscription.currentPeriodEnd && (
                <div className="text-sm text-gray-600 mt-2">
                  Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Usage This Month</h2>
          
          <div className="space-y-4">
            {/* Email Usage */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-700">Emails Sent</span>
                <span className="font-semibold">
                  {usage.emailsSentThisMonth} / {usage.limits.maxEmailsPerMonth}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(
                      (usage.emailsSentThisMonth / usage.limits.maxEmailsPerMonth) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Campaign Usage */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-700">Campaigns</span>
                <span className="font-semibold">
                  {usage.campaignsCreated} / {usage.limits.maxCampaigns === 999999 ? '∞' : usage.limits.maxCampaigns}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(
                      (usage.campaignsCreated / (usage.limits.maxCampaigns === 999999 ? usage.campaignsCreated + 1 : usage.limits.maxCampaigns)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Seats Usage */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-700">Team Seats</span>
                <span className="font-semibold">
                  {usage.seatsUsed} / {usage.limits.maxSeats}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(
                      (usage.seatsUsed / usage.limits.maxSeats) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Options */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Upgrade Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(PLANS).map(([planId, plan]) => {
              const isCurrentPlan = subscription.plan === planId;
              const isUpgrade = getPlanOrder(subscription.plan) < getPlanOrder(planId);

              return (
                <div
                  key={planId}
                  className={`border-2 rounded-lg p-4 ${
                    isCurrentPlan
                      ? 'border-blue-500 bg-blue-50'
                      : isUpgrade
                        ? 'border-gray-300 hover:border-blue-500 cursor-pointer'
                        : 'border-gray-200 opacity-50'
                  }`}
                  onClick={isUpgrade ? () => handleUpgrade(planId) : undefined}
                >
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="text-2xl font-bold mt-2">${plan.price}/mo</div>
                  <ul className="mt-4 space-y-2 text-sm">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-green-500 mr-2">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan && (
                    <div className="mt-4 text-center text-blue-600 font-semibold">
                      Current Plan
                    </div>
                  )}
                  {isUpgrade && (
                    <button
                      className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpgrade(planId);
                      }}
                    >
                      Upgrade
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function getPlanOrder(plan: string): number {
  const order: Record<string, number> = {
    starter: 1,
    growth: 2,
    domination: 3,
  };
  return order[plan] || 0;
}

async function handleUpgrade(plan: string) {
  try {
    const response = await fetch('/api/billing/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });

    if (!response.ok) {
      throw new Error('Failed to upgrade');
    }

    // Reload page to show updated plan
    window.location.reload();
  } catch (error) {
    console.error('Error upgrading:', error);
    alert('Failed to upgrade. Please try again.');
  }
}
