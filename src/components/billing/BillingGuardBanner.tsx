/**
 * Block 9100 — Billing Guard Banner
 * Shows warnings/errors when account is locked or limits are reached
 */

'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, X, Lock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpgradeModal } from './UpgradeModal';

export interface BillingGuardBannerProps {
  accountId?: string | null;
  className?: string;
}

export function BillingGuardBanner({ accountId, className = '' }: BillingGuardBannerProps) {
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }

    async function fetchBillingStatus() {
      try {
        const response = await fetch(`/api/billing/status?accountId=${accountId}`);
        if (response.ok) {
          const data = await response.json();
          setBillingStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch billing status:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchBillingStatus();
  }, [accountId]);

  if (loading || !billingStatus || dismissed) {
    return null;
  }

  const { plan, emailUsage, emailLimit, isLocked, subscriptionStatus } = billingStatus;

  // Don't show banner if everything is fine
  if (!isLocked && subscriptionStatus === 'active' && emailUsage < emailLimit * 0.9) {
    return null;
  }

  // BLOCK 269700: Missed payment = immediate silence.
  if (['unpaid', 'past_due', 'payment_action_required'].includes(subscriptionStatus)) {
    return (
      <div className={`bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 ${className}`}>
        <div className="flex items-start">
          <div className="flex-shrink-0 text-yellow-600">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm text-yellow-800">Outreach paused.</p>
          </div>
        </div>
      </div>
    );
  }

  const getBannerContent = () => {
    if (isLocked) {
      return {
        type: 'error' as const,
        icon: <Lock className="h-5 w-5" />,
        title: 'Account Locked',
        message:
          subscriptionStatus === 'unpaid'
            ? 'Your account has been locked due to payment issues. Please update your payment method to resume outreach.'
            : 'Your account has been locked. Please contact support.',
        action: subscriptionStatus === 'unpaid' ? 'Update Payment' : 'Contact Support',
        actionUrl: subscriptionStatus === 'unpaid' ? '/settings/billing' : 'mailto:support@smartsend.ai',
      };
    }

    if (subscriptionStatus === 'past_due') {
      return {
        type: 'warning' as const,
        icon: <CreditCard className="h-5 w-5" />,
        title: 'Payment Issue',
        message: 'Your subscription payment failed. Please update your payment method to avoid account lockout.',
        action: 'Update Payment',
        actionUrl: '/settings/billing',
      };
    }

    if (emailUsage >= emailLimit) {
      return {
        type: 'error' as const,
        icon: <AlertCircle className="h-5 w-5" />,
        title: 'Contact Limit Reached',
        message: `You've reached your ${plan} plan contact limit (${emailLimit.toLocaleString()} homeowners/month). Upgrade to reach more homeowners.`,
        action: 'Upgrade Plan',
        actionUrl: null, // Will trigger upgrade modal
      };
    }

    if (emailUsage >= emailLimit * 0.9) {
      return {
        type: 'warning' as const,
        icon: <AlertCircle className="h-5 w-5" />,
        title: 'Contact Limit Warning',
        message: `You've used ${emailUsage.toLocaleString()} of ${emailLimit.toLocaleString()} homeowner contacts this month (${Math.round((emailUsage / emailLimit) * 100)}%).`,
        action: 'Upgrade Plan',
        actionUrl: null, // Will trigger upgrade modal
      };
    }

    return null;
  };

  const content = getBannerContent();
  if (!content) {
    return null;
  }

  const handleAction = () => {
    if (content.actionUrl) {
      window.location.href = content.actionUrl;
    } else {
      setShowUpgradeModal(true);
    }
  };

  return (
    <>
      <div
        className={`${
          content.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
        } border-l-4 p-4 mb-4 ${className}`}
      >
        <div className="flex items-start">
          <div
            className={`flex-shrink-0 ${
              content.type === 'error' ? 'text-red-600' : 'text-yellow-600'
            }`}
          >
            {content.icon}
          </div>
          <div className="ml-3 flex-1">
            <h3
              className={`text-sm font-semibold ${
                content.type === 'error' ? 'text-red-800' : 'text-yellow-800'
              }`}
            >
              {content.title}
            </h3>
            <p
              className={`mt-1 text-sm ${
                content.type === 'error' ? 'text-red-700' : 'text-yellow-700'
              }`}
            >
              {content.message}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                onClick={handleAction}
                size="sm"
                className={
                  content.type === 'error'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-yellow-600 hover:bg-yellow-700'
                }
              >
                {content.action}
              </Button>
              <Button
                onClick={() => setDismissed(true)}
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          reason={emailUsage >= emailLimit ? 'email_limit' : 'email_limit'}
          currentPlan={plan}
          currentCount={emailUsage}
          maxAllowed={emailLimit}
        />
      )}
    </>
  );
}
























































