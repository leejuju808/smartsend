/**
 * Block 9100 — Feature Lock Component
 * Shows locked state UI for features that require plan upgrade
 */

'use client';

import React, { useState } from 'react';
import { Lock, Sparkles, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpgradeModal } from './UpgradeModal';

export interface FeatureLockProps {
  feature: 'follow_up_brain' | 'revenue_dashboard';
  accountId?: string | null;
  children?: React.ReactNode;
  className?: string;
}

const FEATURE_CONFIG = {
  follow_up_brain: {
    name: 'Follow-Up Brain',
    icon: <Sparkles className="h-5 w-5" />,
    description: 'Advanced AI personalization and follow-up logic',
    requiredPlan: 'growth',
  },
  revenue_dashboard: {
    name: 'Revenue Dashboard',
    icon: <BarChart3 className="h-5 w-5" />,
    description: 'Track revenue, jobs, and pipeline performance',
    requiredPlan: 'domination',
  },
};

export function FeatureLock({
  feature,
  accountId,
  children,
  className = '',
}: FeatureLockProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>('starter');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const config = FEATURE_CONFIG[feature];

  React.useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }

    async function checkFeatureAccess() {
      try {
        const response = await fetch(`/api/billing/feature-access?accountId=${accountId}&feature=${feature}`);
        if (response.ok) {
          const data = await response.json();
          setHasAccess(data.hasAccess);
          setCurrentPlan(data.currentPlan || 'starter');
        }
      } catch (error) {
        console.error('Failed to check feature access:', error);
      } finally {
        setLoading(false);
      }
    }

    checkFeatureAccess();
  }, [accountId, feature]);

  if (loading) {
    return (
      <div className={`relative ${className}`}>
        <div className="animate-pulse bg-gray-100 rounded-lg h-32" />
      </div>
    );
  }

  // If user has access, render children normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // Otherwise, show locked state
  return (
    <>
      <div className={`relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center ${className}`}>
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-3 bg-gray-100 rounded-full">
            <Lock className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {config.name} is Locked
            </h3>
            <p className="text-sm text-gray-600 mb-4">{config.description}</p>
            <p className="text-xs text-gray-500 mb-4">
              Available on {config.requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan and above
            </p>
            <Button
              onClick={() => setShowUpgradeModal(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Upgrade to {config.requiredPlan === 'growth' ? 'Growth' : 'Domination'}
            </Button>
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          reason="feature_access"
          currentPlan={currentPlan as 'starter' | 'growth' | 'domination'}
          featureName={feature}
        />
      )}
    </>
  );
}
























































