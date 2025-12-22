'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, DollarSign, Users, TrendingUp, MapPin } from 'lucide-react';

interface PartnerMetrics {
  partner: {
    id: string;
    name: string;
    region: string;
  };
  metrics: {
    active_orgs: number;
    total_orgs: number;
    total_revenue_usd: number;
    partner_share_usd: number;
    monthly_mrr_usd: number;
    pending_payouts: number;
    revenue_share_percent: number;
    minimum_orgs_required: number;
    certification_level: string;
  };
  orgs: Array<{
    id: string;
    name: string;
  }>;
}

export default function PartnerPortal() {
  const [data, setData] = useState<PartnerMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const res = await fetch('/api/partners/portal/metrics');
      if (!res.ok) throw new Error('Failed to fetch metrics');
      const data = await res.json();
      setData(data);
    } catch (error) {
      console.error('Failed to fetch partner metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-600">Partner portal access not configured.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { partner, metrics } = data;
  const revenuePercent = metrics.total_revenue_usd > 0 
    ? (metrics.partner_share_usd / metrics.total_revenue_usd) * 100 
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Partner Portal</h1>
          <p className="text-gray-600 mt-1">{partner.name} • {partner.region}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Certification</div>
          <div className="text-sm font-medium capitalize">{metrics.certification_level}</div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orgs</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.active_orgs}</div>
            <div className="text-xs text-gray-500 mt-1">
              Target: {metrics.minimum_orgs_required}
            </div>
            {metrics.active_orgs >= metrics.minimum_orgs_required && (
              <div className="text-xs text-green-600 mt-1">✓ Requirement met</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics.monthly_mrr_usd / 1000).toFixed(1)}K</div>
            <div className="text-xs text-gray-500 mt-1">
              Partner share: {metrics.revenue_share_percent}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue Share</CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics.partner_share_usd / 1000).toFixed(1)}K</div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics.pending_payouts} pending payout{metrics.pending_payouts !== 1 ? 's' : ''}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Tabs defaultValue="orgs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="orgs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Partner Organizations</CardTitle>
              <CardDescription>{data.orgs.length} total organizations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.orgs.length > 0 ? (
                  data.orgs.map((org) => (
                    <div
                      key={org.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <span className="font-medium">{org.name}</span>
                      <span className="text-sm text-gray-500">{org.id.slice(0, 8)}...</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No organizations yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Breakdown</CardTitle>
              <CardDescription>Total revenue and partner share</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Total Revenue</span>
                  <span className="font-medium">${(metrics.total_revenue_usd / 1000).toFixed(1)}K</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Partner Share ({metrics.revenue_share_percent}%)</span>
                  <span className="font-medium text-green-600">
                    ${(metrics.partner_share_usd / 1000).toFixed(1)}K
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Monthly MRR</span>
                  <span className="font-medium">${(metrics.monthly_mrr_usd / 1000).toFixed(1)}K</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payouts</CardTitle>
              <CardDescription>Revenue share payouts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                {metrics.pending_payouts > 0
                  ? `${metrics.pending_payouts} payout(s) pending processing.`
                  : 'No pending payouts.'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Payouts are processed monthly on the 15th.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

