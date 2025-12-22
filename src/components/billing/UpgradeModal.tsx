/**
 * Block 20900 — Upgrade Modal Component
 * 
 * Displays upgrade prompts when users hit plan limits or try to access premium features
 */

'use client';

import React, { useState } from 'react';
import { X, Zap, TrendingUp, Crown, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  featureDisplayName?: string;
  currentPlan?: 'starter' | 'growth' | 'domination';
  requiredPlan?: 'growth' | 'domination';
  reason?: 'campaign_limit' | 'email_limit' | 'seat_limit' | 'feature_access';
  currentCount?: number;
  maxAllowed?: number | null;
  message?: string;
}

const PLAN_FEATURES = {
  growth: [
    '3 Campaigns',
    '2,000 emails per month',
    'Full Insurance Brain',
    'Scope Parser',
    'Install-Ready Playbook',
    'Hot Lead Engine',
    'Contact Card v1',
    'CRM Pipeline',
    'Calendar Integration',
    'Up to 3 team members',
  ],
  domination: [
    'High-volume campaigns',
    '20,000 emails per month',
    'Full Insurance Brain Stack',
    'Proposal Builder',
    'AI Estimator',
    'Adjuster Engine',
    'Revenue Dashboard',
    'Team seats included',
    'VIP Onboarding',
    'Full Automation Suite',
  ],
};

export function UpgradeModal({
  isOpen,
  onClose,
  feature,
  featureDisplayName,
  currentPlan = 'starter',
  requiredPlan = 'growth',
  reason,
  currentCount,
  maxAllowed,
  message,
}: UpgradeModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: requiredPlan }),
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

  const getTitle = () => {
    if (featureDisplayName) {
      return `🔒 Unlock ${featureDisplayName}`;
    }
    
    switch (reason) {
      case 'campaign_limit':
        return '🔒 Campaign Limit Reached';
      case 'email_limit':
        return '🔒 Email Limit Reached';
      case 'seat_limit':
        return '🔒 Team Member Limit Reached';
      default:
        return '🔒 Upgrade Required';
    }
  };

  const getDescription = () => {
    if (message) {
      return message;
    }

    if (featureDisplayName) {
      return `This feature is available on ${requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan. Upgrade to access ${featureDisplayName} and unlock powerful roofing tools.`;
    }

    switch (reason) {
      case 'campaign_limit':
        return `You've reached your campaign limit (${currentCount}/${maxAllowed}). Upgrade to ${requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan to create more campaigns.`;
      case 'email_limit':
        return `You've reached your monthly email limit (${currentCount}/${maxAllowed}). Upgrade to ${requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan to send more emails.`;
      case 'seat_limit':
        return `You've reached your team member limit (${currentCount}/${maxAllowed}). Upgrade to ${requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan to add more team members.`;
      default:
        return `Upgrade to ${requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan to access this feature.`;
    }
  };

  const planFeatures = PLAN_FEATURES[requiredPlan] || PLAN_FEATURES.growth;
  const planPrice = requiredPlan === 'growth' ? '$199/mo' : '$399/mo';
  const planIcon = requiredPlan === 'growth' ? TrendingUp : Crown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-2xl font-bold text-white">{getTitle()}</h2>
          <p className="text-blue-100 mt-1">{getDescription()}</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Plan Comparison */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              {React.createElement(planIcon, { className: 'h-6 w-6 text-blue-600' })}
              <div>
                <h3 className="text-xl font-semibold">
                  {requiredPlan === 'growth' ? 'Growth Plan' : 'Domination Plan'}
                </h3>
                <p className="text-gray-600">{planPrice}</p>
              </div>
            </div>

            <ul className="space-y-2">
              {planFeatures.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Current Usage (if applicable) */}
          {currentCount !== undefined && maxAllowed !== null && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Current Usage</span>
                <span className="text-sm text-gray-600">
                  {currentCount} / {maxAllowed}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((currentCount / maxAllowed) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* CTA Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>Processing...</>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Upgrade to {requiredPlan === 'growth' ? 'Growth' : 'Domination'}
                </>
              )}
            </button>
            <button
              onClick={() => router.push('/settings?section=billing')}
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
