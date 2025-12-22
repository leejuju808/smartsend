"use client";

import { useEffect, useState } from "react";
import { CreditCard, Mail, FolderKanban, Calendar, Users, TrendingUp } from "lucide-react";
import { getPlanLimits, type PlanId } from "@/lib/billing/plan-limits";
import Link from "next/link";

interface UsageStats {
  plan: PlanId;
  limits: {
    maxCampaigns: number | null;
    maxEmailsPerMonth: number | null;
  };
  usage: {
    campaignsCreated: number;
    emailsSentThisMonth: number;
  };
  remaining: {
    campaigns: number | null;
    emails: number | null;
  };
  billingStatus: {
    billingStatus: string;
    daysSincePaymentFailed: number;
    gracePeriodEndsAt: string | null;
    canSend: boolean;
    canSchedule: boolean;
    canUseInbox: boolean;
  };
}

export function BillingDashboardWidget() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsageStats();
  }, []);

  const fetchUsageStats = async () => {
    try {
      const response = await fetch('/api/billing/usage');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const planLimits = getPlanLimits(stats.plan);
  const isPastDue = stats.billingStatus.billingStatus === 'past_due' || 
                    stats.billingStatus.billingStatus === 'grace_period';

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Billing & Usage</h2>
          <p className="text-sm text-gray-600 mt-1">
            Current Plan: <span className="font-medium">{planLimits.name}</span>
          </p>
        </div>
        <Link
          href="/settings/billing"
          className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Manage Billing
        </Link>
      </div>

      {/* Payment Warning Banner */}
      {isPastDue && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-yellow-900">Payment Issue</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {stats.billingStatus.daysSincePaymentFailed > 0 && (
                  <>Your payment failed {stats.billingStatus.daysSincePaymentFailed} day{stats.billingStatus.daysSincePaymentFailed !== 1 ? 's' : ''} ago. </>
                )}
                Please update your payment method to avoid service interruption.
              </p>
              {stats.billingStatus.gracePeriodEndsAt && (
                <p className="text-xs text-yellow-600 mt-1">
                  Grace period ends: {new Date(stats.billingStatus.gracePeriodEndsAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Emails Sent */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Emails Sent This Month</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {stats.usage.emailsSentThisMonth.toLocaleString()}
              </span>
              {stats.limits.maxEmailsPerMonth && (
                <span className="text-sm text-gray-500">
                  / {stats.limits.maxEmailsPerMonth.toLocaleString()}
                </span>
              )}
            </div>
            {stats.limits.maxEmailsPerMonth && (
              <>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      stats.usage.emailsSentThisMonth / stats.limits.maxEmailsPerMonth > 0.9
                        ? 'bg-red-500'
                        : stats.usage.emailsSentThisMonth / stats.limits.maxEmailsPerMonth > 0.7
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (stats.usage.emailsSentThisMonth / stats.limits.maxEmailsPerMonth) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {stats.remaining.emails !== null
                    ? `${stats.remaining.emails.toLocaleString()} remaining`
                    : 'Included'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Campaigns */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Campaigns Created</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {stats.usage.campaignsCreated}
              </span>
              {stats.limits.maxCampaigns && (
                <span className="text-sm text-gray-500">
                  / {stats.limits.maxCampaigns}
                </span>
              )}
            </div>
            {stats.limits.maxCampaigns && (
              <>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      stats.usage.campaignsCreated >= stats.limits.maxCampaigns
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (stats.usage.campaignsCreated / stats.limits.maxCampaigns) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {stats.remaining.campaigns !== null
                    ? `${stats.remaining.campaigns} remaining`
                    : 'Included'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Feature Status */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Feature Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <Mail className={`w-4 h-4 ${stats.billingStatus.canSend ? 'text-green-500' : 'text-gray-300'}`} />
            <span className={`text-xs ${stats.billingStatus.canSend ? 'text-gray-700' : 'text-gray-400'}`}>
              Sending
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className={`w-4 h-4 ${stats.billingStatus.canSchedule ? 'text-green-500' : 'text-gray-300'}`} />
            <span className={`text-xs ${stats.billingStatus.canSchedule ? 'text-gray-700' : 'text-gray-400'}`}>
              Scheduler
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className={`w-4 h-4 ${stats.billingStatus.canUseInbox ? 'text-green-500' : 'text-gray-300'}`} />
            <span className={`text-xs ${stats.billingStatus.canUseInbox ? 'text-gray-700' : 'text-gray-400'}`}>
              Inbox
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${planLimits.name === 'Domination' ? 'text-green-500' : 'text-gray-300'}`} />
            <span className={`text-xs ${planLimits.name === 'Domination' ? 'text-gray-700' : 'text-gray-400'}`}>
              Revenue Dashboard
            </span>
          </div>
        </div>
      </div>

      {/* Upgrade CTA */}
      {stats.plan !== 'domination' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-blue-900">Ready to scale?</h3>
              <p className="text-sm text-blue-700 mt-1">
                Upgrade to unlock more campaigns and higher sending limits.
              </p>
            </div>
            <Link
              href="/settings/billing"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Upgrade Plan
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}














































