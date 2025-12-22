'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, Globe, DollarSign, TrendingUp, Target } from 'lucide-react';
import { isSalesModeEnabled } from '@/lib/feature-flags';

interface EnterpriseKPIs {
  active_orgs_count: number;
  enterprise_clients_count: number;
  regional_partners_count: number;
  monthly_mrr_usd: number;
  avg_contract_value_usd: number;
}

interface KPITargets {
  active_orgs_target: number;
  enterprise_clients_target: number;
  regional_partners_target: number;
  monthly_mrr_target_usd: number;
  avg_contract_value_target_usd: number;
}

interface ProgressMetrics {
  active_orgs_percent: number;
  enterprise_clients_percent: number;
  regional_partners_percent: number;
  mrr_percent: number;
}

export default function EnterpriseDashboard() {
  const router = useRouter();
  if (isSalesModeEnabled()) return null;
  const [kpis, setKpis] = useState<EnterpriseKPIs | null>(null);
  const [targets, setTargets] = useState<KPITargets | null>(null);
  const [progress, setProgress] = useState<ProgressMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // BLOCK 281000 — Sales Mode: hide non-v1 surface area.
    if (isSalesModeEnabled()) {
      router.replace('/dashboard');
      return;
    }
    fetchKPIs();
    const interval = setInterval(fetchKPIs, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchKPIs() {
    try {
      const res = await fetch('/api/enterprise/kpis');
      const data = await res.json();
      setKpis(data.kpis);
      setTargets(data.targets);
      setProgress(data.progress);
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enterprise Expansion Dashboard</h1>
          <p className="text-gray-600 mt-1">Track global growth and partnerships</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Last updated</div>
          <div className="text-sm font-medium">{new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Orgs"
          value={kpis?.active_orgs_count || 0}
          target={targets?.active_orgs_target || 1000}
          progress={progress?.active_orgs_percent || 0}
          icon={<Users className="h-5 w-5" />}
          format="number"
        />
        <KPICard
          title="Enterprise Clients"
          value={kpis?.enterprise_clients_count || 0}
          target={targets?.enterprise_clients_target || 20}
          progress={progress?.enterprise_clients_percent || 0}
          icon={<Building2 className="h-5 w-5" />}
          format="number"
        />
        <KPICard
          title="Regional Partners"
          value={kpis?.regional_partners_count || 0}
          target={targets?.regional_partners_target || 5}
          progress={progress?.regional_partners_percent || 0}
          icon={<Globe className="h-5 w-5" />}
          format="number"
        />
        <KPICard
          title="Monthly MRR"
          value={kpis?.monthly_mrr_usd || 0}
          target={targets?.monthly_mrr_target_usd || 250000}
          progress={progress?.mrr_percent || 0}
          icon={<DollarSign className="h-5 w-5" />}
          format="currency"
        />
      </div>

      {/* Detailed Metrics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Target Progress</CardTitle>
                <CardDescription>Progress toward Dec 2026 goals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProgressItem
                  label="Active Orgs (1,000 target)"
                  value={kpis?.active_orgs_count || 0}
                  target={targets?.active_orgs_target || 1000}
                  progress={progress?.active_orgs_percent || 0}
                />
                <ProgressItem
                  label="Enterprise Clients (20 target)"
                  value={kpis?.enterprise_clients_count || 0}
                  target={targets?.enterprise_clients_target || 20}
                  progress={progress?.enterprise_clients_percent || 0}
                />
                <ProgressItem
                  label="Regional Partners (5 target)"
                  value={kpis?.regional_partners_count || 0}
                  target={targets?.regional_partners_target || 5}
                  progress={progress?.regional_partners_percent || 0}
                />
                <ProgressItem
                  label="Monthly MRR ($250K target)"
                  value={kpis?.monthly_mrr_usd || 0}
                  target={targets?.monthly_mrr_target_usd || 250000}
                  progress={progress?.mrr_percent || 0}
                  format="currency"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Metrics</CardTitle>
                <CardDescription>Contract value and MRR</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Average Contract Value</span>
                    <span className="font-medium">
                      ${((kpis?.avg_contract_value_usd || 0) / 1000).toFixed(1)}K
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Target: ${((targets?.avg_contract_value_target_usd || 0) / 1000).toFixed(0)}K
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Monthly Recurring Revenue</span>
                    <span className="font-medium">
                      ${((kpis?.monthly_mrr_usd || 0) / 1000).toFixed(1)}K
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Target: ${((targets?.monthly_mrr_target_usd || 0) / 1000).toFixed(0)}K
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="partners">
          <Card>
            <CardHeader>
              <CardTitle>Regional Partners</CardTitle>
              <CardDescription>Active partner network</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Partner management interface coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <CardTitle>Enterprise Contracts</CardTitle>
              <CardDescription>Active enterprise agreements</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Contract management interface coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: number;
  target: number;
  progress: number;
  icon: React.ReactNode;
  format?: 'number' | 'currency';
}

function KPICard({ title, value, target, progress, icon, format = 'number' }: KPICardProps) {
  const displayValue =
    format === 'currency' ? `$${((value || 0) / 1000).toFixed(1)}K` : value.toLocaleString();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-gray-400">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{displayValue}</div>
        <div className="text-xs text-gray-500 mt-1">
          Target: {format === 'currency' ? `$${(target / 1000).toFixed(0)}K` : target.toLocaleString()}
        </div>
        <div className="mt-2">
          <Progress value={Math.min(progress, 100)} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

interface ProgressItemProps {
  label: string;
  value: number;
  target: number;
  progress: number;
  format?: 'number' | 'currency';
}

function ProgressItem({ label, value, target, progress, format = 'number' }: ProgressItemProps) {
  const displayValue =
    format === 'currency' ? `$${((value || 0) / 1000).toFixed(1)}K` : value.toLocaleString();
  const displayTarget =
    format === 'currency' ? `$${(target / 1000).toFixed(0)}K` : target.toLocaleString();

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">
          {displayValue} / {displayTarget}
        </span>
      </div>
      <Progress value={Math.min(progress, 100)} className="h-2" />
      <div className="text-xs text-gray-500 mt-1">{progress.toFixed(1)}% complete</div>
    </div>
  );
}

