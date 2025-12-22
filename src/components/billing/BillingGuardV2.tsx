/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Main billing guard component with upgrade prompts and usage display
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export function BillingGuardV2() {
  const router = useRouter();
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
    return <div className="p-4">Loading billing information...</div>;
  }

  if (!data) {
    return <div className="p-4 text-red-600">Error loading billing data</div>;
  }

  const { usage, billingStatus, subscription, upsellTriggers } = data;

  // Show trial expired banner
  if (billingStatus.trialExpired) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-red-800">
              Trial Expired — Upgrade to Continue
            </h3>
            <p className="text-red-700 mt-1">
              Your 7-day trial has ended. Upgrade now to unlock all SmartSend features.
            </p>
          </div>
          <button
            onClick={() => router.push('/settings/billing')}
            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  // Show trial expiring banner
  if (subscription.isTrialActive && billingStatus.daysUntilTrialExpires <= 2) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-yellow-800">
              Trial Expiring Soon
            </h3>
            <p className="text-yellow-700 mt-1">
              Your trial expires in {billingStatus.daysUntilTrialExpires} day
              {billingStatus.daysUntilTrialExpires > 1 ? 's' : ''}. Upgrade now to keep SmartSend running.
            </p>
          </div>
          <button
            onClick={() => router.push('/settings/billing')}
            className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  // Show upsell triggers
  if (upsellTriggers && upsellTriggers.length > 0) {
    const highPriorityTrigger = upsellTriggers.find((t) => t.urgency === 'high');
    
    if (highPriorityTrigger) {
      return (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-800">
                {highPriorityTrigger.type === 'limit_reached' ? 'Limit Reached' : 'Upgrade Recommended'}
              </h3>
              <p className="text-blue-700 mt-1">{highPriorityTrigger.message}</p>
            </div>
            <button
              onClick={() => handleUpgrade(highPriorityTrigger.upgradePlan)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Upgrade to {highPriorityTrigger.upgradePlan.charAt(0).toUpperCase() + highPriorityTrigger.upgradePlan.slice(1)}
            </button>
          </div>
        </div>
      );
    }
  }

  return null;
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

    // Redirect to billing page or Stripe checkout
    window.location.href = '/settings/billing';
  } catch (error) {
    console.error('Error upgrading:', error);
    alert('Failed to upgrade. Please try again.');
  }
}





















































