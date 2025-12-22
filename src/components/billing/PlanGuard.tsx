/**
 * PlanGuard Component
 * Wraps actions that require plan limits and shows upgrade modal when limit is reached
 */

'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useOrgBilling } from '@/hooks/useOrgBilling';
import { UpgradeModal } from './UpgradeModal';
import { createClient } from '@/lib/supabaseClient';

interface PlanGuardProps {
  feature: 'campaigns' | 'emails';
  children: ReactNode;
  onLimitReached?: () => void;
  orgId?: string | null;
}

export function PlanGuard({ feature, children, orgId: providedOrgId, onLimitReached }: PlanGuardProps) {
  const [orgId, setOrgId] = useState<string | null>(providedOrgId || null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { billing, usage, loading } = useOrgBilling(orgId);

  // Get org_id if not provided
  useEffect(() => {
    if (!providedOrgId) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from('org_members')
            .select('org_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
              if (data) setOrgId(data.org_id);
            });
        }
      });
    }
  }, [providedOrgId]);

  const checkLimit = (): boolean => {
    if (loading || !billing) return true; // Allow during loading

    if (billing.subscription_status !== 'active' && billing.subscription_status !== 'trialing') {
      setShowUpgradeModal(true);
      onLimitReached?.();
      return false;
    }

    if (feature === 'campaigns') {
      // This is checked server-side, but we can show a warning
      return true;
    }

    if (feature === 'emails') {
      const limit = billing.monthly_email_limit;
      const current = usage?.emails_sent || 0;
      
      if (limit !== null && current >= limit) {
        setShowUpgradeModal(true);
        onLimitReached?.();
        return false;
      }
    }

    return true;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!checkLimit()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <>
      <div onClick={handleClick}>
        {children}
      </div>
      {showUpgradeModal && billing && (
        <UpgradeModal
          currentPlan={billing.current_plan}
          feature={feature}
          usage={usage}
          limits={billing}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </>
  );
}

// Helper hook to check if action is allowed
export function usePlanCheck(feature: 'campaigns' | 'emails', orgId?: string | null) {
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(orgId || null);
  const { billing, usage, loading } = useOrgBilling(currentOrgId);

  useEffect(() => {
    if (!orgId) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from('org_members')
            .select('org_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
              if (data) setCurrentOrgId(data.org_id);
            });
        }
      });
    }
  }, [orgId]);

  const isAllowed = (): boolean => {
    if (loading || !billing) return true;

    if (billing.subscription_status !== 'active' && billing.subscription_status !== 'trialing') {
      return false;
    }

    if (feature === 'emails') {
      const limit = billing.monthly_email_limit;
      const current = usage?.emails_sent || 0;
      return limit === null || current < limit;
    }

    return true;
  };

  return {
    isAllowed: isAllowed(),
    billing,
    usage,
    loading,
  };
}

