"use client";

import useSWR from "swr";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, Workflow, Bot, TrendingUp, DollarSign, Users, Activity } from "lucide-react";
import Link from "next/link";
import { isSalesModeEnabled } from "@/lib/feature-flags";

const f = (u: string) => fetch(u).then(r => r.json());

interface OSMetricsData {
  campaigns: number;
  workflows: number;
  agents: number;
  total_events: number;
}

interface AUREVMetrics {
  org_id: string;
  total_users: number;
  total_actions_today: number;
  combined_revenue: {
    mrr: number;
    arr: number;
    active_orgs: number;
  };
  apps: {
    smartsend: {
      active: boolean;
      emails_sent_today: number;
      leads_generated: number;
    };
    opsgrid: {
      active: boolean;
      workflows_run: number;
      tasks_completed: number;
    };
    agentcloud: {
      active: boolean;
      messages_sent: number;
      agents_deployed: number;
    };
  };
  recent_activity: Array<{
    id: string;
    app: string;
    action: string;
    timestamp: string;
  }>;
}

export default function Dashboard() {
  const router = useRouter();
  if (isSalesModeEnabled()) return null;
  useEffect(() => {
    // BLOCK 281000 — Sales Mode: hide non-v1 surface area.
    if (isSalesModeEnabled()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const { data: metrics } = useSWR<OSMetricsData>("/api/os-metrics", f);
  const { data: aurevMetrics, error } = useSWR<AUREVMetrics>("/api/aurev/metrics", f, {
    refreshInterval: 30000 // Refresh every 30 seconds
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            ⚡ AUREV HQ
          </h1>
          <p className="text-xl text-gray-400">
            One AI Operating System powering Communication ⚡ Operations ⚡ Agents
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid md:grid-cols-4 gap-6">
          <MetricCard
            icon={<Users className="h-6 w-6" />}
            title="Active Orgs"
            value={aurevMetrics?.combined_revenue?.active_orgs ?? 0}
            trend="+12%"
          />
          <MetricCard
            icon={<DollarSign className="h-6 w-6" />}
            title="MRR"
            value={`$${(aurevMetrics?.combined_revenue?.mrr ?? 0) / 1000}K`}
            trend="+18%"
          />
          <MetricCard
            icon={<Activity className="h-6 w-6" />}
            title="Actions Today"
            value={aurevMetrics?.total_actions_today ?? 0}
            trend="+5%"
          />
          <MetricCard
            icon={<TrendingUp className="h-6 w-6" />}
            title="ARR"
            value={`$${(aurevMetrics?.combined_revenue?.arr ?? 0) / 1000}K`}
            trend="+22%"
          />
        </div>

        {/* Apps Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <AppTile
            title="SmartSend"
            subtitle="Communication ⚡"
            icon={<Zap className="h-8 w-8" />}
            metrics={{
              emails_sent: aurevMetrics?.apps?.smartsend?.emails_sent_today ?? 0,
              leads_generated: aurevMetrics?.apps?.smartsend?.leads_generated ?? 0,
            }}
            active={aurevMetrics?.apps?.smartsend?.active ?? false}
            url="/dashboard"
          />
          <AppTile
            title="OpsGrid"
            subtitle="Operations ⚡"
            icon={<Workflow className="h-8 w-8" />}
            metrics={{
              workflows: aurevMetrics?.apps?.opsgrid?.workflows_run ?? 0,
              tasks_completed: aurevMetrics?.apps?.opsgrid?.tasks_completed ?? 0,
            }}
            active={aurevMetrics?.apps?.opsgrid?.active ?? false}
            url="/opsgrid"
          />
          <AppTile
            title="AgentCloud"
            subtitle="Agents ⚡"
            icon={<Bot className="h-8 w-8" />}
            metrics={{
              messages_sent: aurevMetrics?.apps?.agentcloud?.messages_sent ?? 0,
              agents_deployed: aurevMetrics?.apps?.agentcloud?.agents_deployed ?? 0,
            }}
            active={aurevMetrics?.apps?.agentcloud?.active ?? false}
            url="/agents"
          />
        </div>

        {/* Recent Activity Feed */}
        <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
          <h2 className="text-2xl font-bold mb-4 text-yellow-500">Recent Activity</h2>
          <div className="space-y-3">
            {aurevMetrics?.recent_activity && aurevMetrics.recent_activity.length > 0 ? (
              aurevMetrics.recent_activity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-yellow-500 font-semibold uppercase text-xs">
                      {activity.app}
                    </span>
                    <span className="text-gray-300">{activity.action}</span>
                  </div>
                  <span className="text-gray-500 text-sm">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-center py-8">
                No recent activity. Start using AUREV apps to see real-time updates here.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>⚡ AUREV HQ • Where Intelligent Automation Meets Execution</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, title, value, trend }: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  trend?: string;
}) {
  return (
    <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800 hover:border-yellow-500/50 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="text-yellow-500">{icon}</div>
        {trend && (
          <span className="text-green-500 text-sm font-semibold">{trend}</span>
        )}
      </div>
      <h3 className="text-gray-400 text-sm mb-2">{title}</h3>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function AppTile({
  title,
  subtitle,
  icon,
  metrics,
  active,
  url
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  metrics: Record<string, number>;
  active: boolean;
  url?: string;
}) {
  const content = (
    <div className={`border rounded-2xl p-6 bg-gray-900/50 border-gray-800 hover:border-yellow-500/50 transition-colors h-full ${!active ? 'opacity-50' : ''}`}>
      <div className="flex items-center space-x-4 mb-6">
        <div className="text-yellow-500">{icon}</div>
        <div>
          <h2 className="font-bold text-xl text-white">{title}</h2>
          <p className="text-gray-400 text-sm">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-gray-400 capitalize">
              {key.replace(/_/g, ' ')}:
            </span>
            <span className="text-2xl font-bold text-yellow-500">{value.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {!active && (
        <div className="mt-4 text-center">
          <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
            Coming Soon
          </span>
        </div>
      )}
    </div>
  );

  if (url && active) {
    return <Link href={url}>{content}</Link>;
  }

  return content;
}
