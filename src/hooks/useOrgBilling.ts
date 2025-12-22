/**
 * useOrgBilling Hook
 * Fetches and provides org billing information, plan limits, and usage
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';

export interface OrgBillingInfo {
  org_id: string;
  current_plan: 'trial' | 'starter' | 'growth' | 'domination';
  subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  max_active_campaigns: number | null;
  monthly_email_limit: number | null;
}

export interface OrgUsage {
  emails_sent: number;
  campaigns_created: number;
  period_start: string;
  period_end: string;
}

export interface OrgBillingData {
  billing: OrgBillingInfo | null;
  usage: OrgUsage | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOrgBilling(orgId: string | null): OrgBillingData {
  const [billing, setBilling] = useState<OrgBillingInfo | null>(null);
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBilling = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Get billing info
      const { data: billingData, error: billingError } = await supabase.rpc(
        'get_org_billing_info',
        { p_org_id: orgId }
      );

      if (billingError) throw billingError;

      if (billingData && billingData.length > 0) {
        setBilling(billingData[0]);
      } else {
        // Default to trial if no billing record
        setBilling({
          org_id: orgId,
          current_plan: 'trial',
          subscription_status: 'trialing',
          stripe_customer_id: null,
          stripe_subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          max_active_campaigns: 1,
          monthly_email_limit: 200,
        });
      }

      // Get usage for current period
      const periodStart = billingData?.[0]?.current_period_start
        ? new Date(billingData[0].current_period_start).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0].slice(0, 7) + '-01';

      const { data: usageData, error: usageError } = await supabase
        .from('org_usage')
        .select('*')
        .eq('org_id', orgId)
        .eq('period_start', periodStart)
        .single();

      if (!usageError && usageData) {
        setUsage({
          emails_sent: usageData.emails_sent || 0,
          campaigns_created: usageData.campaigns_created || 0,
          period_start: usageData.period_start,
          period_end: usageData.period_end,
        });
      } else {
        setUsage({
          emails_sent: 0,
          campaigns_created: 0,
          period_start: periodStart,
          period_end: new Date(new Date(periodStart).setMonth(new Date(periodStart).getMonth() + 1)).toISOString().split('T')[0],
        });
      }
    } catch (err: any) {
      console.error('Error fetching billing info:', err);
      setError(err.message || 'Failed to fetch billing information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, [orgId]);

  return {
    billing,
    usage,
    loading,
    error,
    refetch: fetchBilling,
  };
}





























































