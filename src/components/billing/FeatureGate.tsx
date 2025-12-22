/**
 * Block 20900 — Feature Gate Component
 * 
 * Wraps premium features and shows upgrade modal when access is denied
 */

'use client';

import React, { useState, useEffect } from 'react';
import { UpgradeModal } from './UpgradeModal';
import { Lock } from 'lucide-react';

interface FeatureGateProps {
  children: React.ReactNode;
  feature: string;
  featureDisplayName?: string;
  orgId: string;
  fallback?: React.ReactNode;
  showUpgradeOnClick?: boolean;
}

export function FeatureGate({
  children,
  feature,
  featureDisplayName,
  orgId,
  fallback,
  showUpgradeOnClick = true,
}: FeatureGateProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [currentPlan, setCurrentPlan] = useState<'starter' | 'growth' | 'domination'>('starter');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    async function checkAccess() {
      try {
        const response = await fetch(
          `/api/billing/feature-access-20900?orgId=${orgId}&feature=${feature}`
        );
        
        if (response.ok) {
          const data = await response.json();
          setHasAccess(data.hasAccess);
          setCurrentPlan(data.currentPlan || 'starter');
        } else {
          setHasAccess(false);
        }
      } catch (error) {
        console.error('Failed to check feature access:', error);
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    }

    checkAccess();
  }, [orgId, feature]);

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-lg h-32 flex items-center justify-center">
        <span className="text-gray-400">Checking access...</span>
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  // Determine required plan
  const requiredPlan: 'growth' | 'domination' = [
    'proposal_builder',
    'ai_estimator',
    'adjuster_engine',
    'revenue_dashboard',
  ].includes(feature)
    ? 'domination'
    : 'growth';

  if (fallback) {
    return (
      <>
        {fallback}
        {showUpgradeModal && (
          <UpgradeModal
            isOpen={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            feature={feature}
            featureDisplayName={featureDisplayName}
            currentPlan={currentPlan}
            requiredPlan={requiredPlan}
            reason="feature_access"
          />
        )}
      </>
    );
  }

  return (
    <>
      <div
        className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => showUpgradeOnClick && setShowUpgradeModal(true)}
      >
        <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          🔒 {featureDisplayName || feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </h3>
        <p className="text-gray-600 mb-4">
          This feature is available on {requiredPlan === 'growth' ? 'Growth' : 'Domination'} plan.
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowUpgradeModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Upgrade to {requiredPlan === 'growth' ? 'Growth' : 'Domination'}
        </button>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature={feature}
          featureDisplayName={featureDisplayName}
          currentPlan={currentPlan}
          requiredPlan={requiredPlan}
          reason="feature_access"
        />
      )}
    </>
  );
}
















































