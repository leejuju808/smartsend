"use client";

import { useState, useEffect } from "react";
import { X, Zap, TrendingUp, Crown } from "lucide-react";
import { getPlanLimits, type PlanId } from "@/lib/billing/plan-limits";
import { useRouter } from "next/navigation";

interface BillingGuardModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string;
  currentPlan?: PlanId;
  upgradePlan?: PlanId;
  limitReached?: {
    type: 'campaigns' | 'emails' | 'feature';
    current: number;
    limit: number;
  };
}

export function BillingGuardModal({
  isOpen,
  onClose,
  reason,
  currentPlan,
  upgradePlan,
  limitReached,
}: BillingGuardModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const currentLimits = currentPlan ? getPlanLimits(currentPlan) : null;
  const upgradeLimits = upgradePlan ? getPlanLimits(upgradePlan) : null;

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      // Redirect to Stripe checkout
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: upgradeLimits?.priceId,
          plan: upgradePlan,
        }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      setIsLoading(false);
    }
  };

  const getPlanIcon = (plan: PlanId) => {
    switch (plan) {
      case 'starter':
        return <Zap className="w-5 h-5" />;
      case 'growth':
        return <TrendingUp className="w-5 h-5" />;
      case 'domination':
        return <Crown className="w-5 h-5" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Upgrade to Send More
            </h2>
            <p className="mt-2 text-gray-600">{reason}</p>
          </div>

          {limitReached && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Current usage:</span> {limitReached.current.toLocaleString()} / {limitReached.limit.toLocaleString()}
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${Math.min(100, (limitReached.current / limitReached.limit) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {upgradePlan && upgradeLimits && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {getPlanIcon(upgradePlan)}
                <h3 className="font-semibold text-lg">{upgradeLimits.name}</h3>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Campaigns:</span>{' '}
                  {upgradeLimits.maxActiveCampaigns === null
                    ? 'Included'
                    : upgradeLimits.maxActiveCampaigns}
                </div>
                <div>
                  <span className="font-medium">Emails/month:</span>{' '}
                  {upgradeLimits.monthlyEmailLimit === null
                    ? 'Included'
                    : upgradeLimits.monthlyEmailLimit.toLocaleString()}
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <span className="text-lg font-bold text-gray-900">
                    ${upgradeLimits.price}/mo
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Maybe Later
            </button>
            {upgradePlan && (
              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-wait"
              >
                {isLoading ? 'Loading...' : 'Upgrade Now'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}














































