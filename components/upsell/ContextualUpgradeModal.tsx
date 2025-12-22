/**
 * Block 23720 — Contextual Upgrade Modal
 * 
 * Shows upgrade prompts with exact scripts from the upsell playbook
 */

'use client';

import React, { useState } from 'react';
import { X, Zap, TrendingUp, Crown, Check, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PlanId } from '@/src/lib/billing/plan-limits';
import { UpgradeTriggerType } from '@/lib/upsell/trigger-detection';

interface ContextualUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerType: UpgradeTriggerType;
  currentPlan: PlanId;
  suggestedPlan: PlanId;
  message: string;
  script: string;
  context?: Record<string, any>;
}

const PLAN_FEATURES = {
  growth: [
    '3 city outreach runs at once',
    '2,000 homeowners contacted per month',
    'Multi-step follow-up sequences',
    'Lead revival follow-ups',
    'Free estimate follow-ups',
    'Storm outreach follow-ups',
    'Advanced automation',
  ],
  domination: [
    'Unlimited city outreach',
    '20,000 homeowners contacted per month',
    'Full automation suite',
    'Storm season power',
    'Multi-city expansion',
    'Advanced segmentation',
    'Regional storm templates',
    'VIP onboarding',
  ],
};

const PLAN_BENEFITS = {
  growth: {
    title: 'More booked estimates, more consistency, more roofs.',
    highlights: [
      'Run multiple city outreach simultaneously',
      'Never miss a follow-up opportunity',
      'Scale your roofing business',
    ],
  },
  domination: {
    title: 'Full automation. Unlimited growth. Maximum revenue.',
    highlights: [
      'Unlimited storm outreach',
      'Handle multiple crews',
      'Dominate your market',
    ],
  },
};

export function ContextualUpgradeModal({
  isOpen,
  onClose,
  triggerType,
  currentPlan,
  suggestedPlan,
  message,
  script,
  context,
}: ContextualUpgradeModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      // Record that user clicked upgrade
      await fetch('/api/upsell/record-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upgrade_clicked',
          triggerType,
          currentPlan,
          suggestedPlan,
        }),
      });

      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: suggestedPlan }),
      });

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error initiating upgrade:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    // Record dismissal
    await fetch('/api/upsell/record-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'dismissed',
        triggerType,
        currentPlan,
        suggestedPlan,
      }),
    });
    onClose();
  };

  const planKey: keyof typeof PLAN_FEATURES =
    suggestedPlan === 'domination' ? 'domination' : 'growth';
  const planFeatures = PLAN_FEATURES[planKey];
  const planBenefits = PLAN_BENEFITS[planKey];
  const planPrice = suggestedPlan === 'growth' ? '$199/mo' : '$399/mo';
  const planIcon = suggestedPlan === 'growth' ? TrendingUp : Crown;
  const planColor = suggestedPlan === 'growth' ? 'from-blue-600 to-purple-600' : 'from-purple-600 to-orange-600';

  // Get contextual title based on trigger type
  const getTitle = () => {
    switch (triggerType) {
      case 'campaign_limit_hit':
        return '🚀 Ready for more city outreach?';
      case 'email_limit_approaching':
        return 'You’re crushing it — unlock more homeowner reach';
      case 'high_engagement':
        return '🔥 Your city outreach is heating up';
      case 'first_campaign_launched':
        return '🎯 Great start — expand your homeowner reach';
      case 'first_replies_received':
        return '💬 Homeowners are responding — time to scale';
      default:
        return '🚀 Ready to Level Up?';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className={`relative bg-gradient-to-r ${planColor} px-6 py-4`}>
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-2xl font-bold text-white">{getTitle()}</h2>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Main Message - Exact Script */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
            <p className="text-gray-800 text-lg leading-relaxed">{script}</p>
          </div>

          {/* Why This Helps Roofers */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
              Why This Helps Roofers:
            </h3>
            <p className="text-gray-700 text-sm">
              {planBenefits.title}
            </p>
            <ul className="mt-3 space-y-2">
              {planBenefits.highlights.map((highlight: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600 text-sm">{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Plan Features */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              {React.createElement(planIcon, { className: 'h-6 w-6 text-blue-600' })}
              <div>
                <h3 className="text-xl font-semibold">
                  {suggestedPlan === 'growth' ? 'Growth Plan' : 'Domination Plan'}
                </h3>
                <p className="text-gray-600">{planPrice}</p>
              </div>
            </div>

            <ul className="space-y-2">
              {planFeatures.map((feature: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Context Info (if available) */}
          {context && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              {context.activeCampaigns !== undefined && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Current:</span> {context.activeCampaigns} city outreach run{context.activeCampaigns !== 1 ? 's' : ''}
                  {context.maxCampaigns && ` / ${context.maxCampaigns} max`}
                </div>
              )}
              {context.emailsSent !== undefined && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Homeowners contacted:</span> {context.emailsSent} / {context.emailLimit}
                  {context.usagePercent && ` (${context.usagePercent}% used)`}
                </div>
              )}
              {context.repliesThisWeek !== undefined && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Homeowners responding (7d):</span> {context.repliesThisWeek}
                </div>
              )}
            </div>
          )}

          {/* CTA Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className={`flex-1 bg-gradient-to-r ${planColor} text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
            >
              {loading ? (
                <>Processing...</>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Upgrade to {suggestedPlan === 'growth' ? 'Growth' : 'Domination'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Maybe Later
            </button>
          </div>

          {/* Footer Note */}
          <p className="mt-4 text-xs text-gray-500 text-center">
            SmartSend upgrades increase your revenue capacity — more city outreach = more booked estimates
          </p>
        </div>
      </div>
    </div>
  );
}






































