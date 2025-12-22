"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Users,
  List,
  Zap,
  RefreshCw,
} from "lucide-react";

interface QueueStats {
  pending: number;
  processing: number;
  failed: number;
  retries: number;
  oldest: string | null;
  newest: string | null;
}

interface DeliverabilityStats {
  avg_reputation: number;
  bounces_24h: number;
  unsubs_24h: number;
  sent_24h: number;
}

interface HotAccount {
  id: string;
  name: string | null;
  intent_score: number;
  domain: string | null;
}

interface SmartList {
  id: string;
  name: string;
  last_refreshed: string | null;
  lead_count: number;
}

interface AIEvent {
  id: string;
  event_type: string;
  created_at: string;
  meta?: any;
}

interface CommandCenterData {
  queue: QueueStats;
  deliverability: DeliverabilityStats;
  hot_accounts: HotAccount[];
  smartlists: SmartList[];
  ai_events: AIEvent[];
  heat_index: number;
}

export default function CommandCenterPage() {
  const router = useRouter();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // Refresh every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      // Get workspace_id from URL or headers
      const workspaceId = new URLSearchParams(window.location.search).get("wid");
      const url = workspaceId
        ? `/api/command-center?wid=${workspaceId}`
        : "/api/command-center";

      const res = await fetch(url, {
        headers: workspaceId
          ? {
              "x-workspace-id": workspaceId,
            }
          : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }

      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load command center data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  const getHeatIndexColor = (index: number) => {
    if (index >= 80) return "text-red-600";
    if (index >= 60) return "text-orange-600";
    if (index >= 40) return "text-yellow-600";
    return "text-green-600";
  };

  const getHeatIndexBg = (index: number) => {
    if (index >= 80) return "bg-red-50 border-red-200";
    if (index >= 60) return "bg-orange-50 border-orange-200";
    if (index >= 40) return "bg-yellow-50 border-yellow-200";
    return "bg-green-50 border-green-200";
  };

  const getReputationColor = (reputation: number) => {
    if (reputation >= 80) return "text-green-600";
    if (reputation >= 70) return "text-yellow-600";
    if (reputation >= 60) return "text-orange-600";
    return "text-red-600";
  };

  const formatEventType = (eventType: string) => {
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="border rounded-lg p-4 bg-red-50 border-red-200">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <div>
              <h3 className="font-semibold text-red-900">Error Loading Command Center</h3>
              <p className="text-sm text-red-700 mt-1">{error || "Unknown error"}</p>
            </div>
          </div>
          <Button onClick={loadData} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SmartSend Command Center</h1>
          <p className="text-gray-600 mt-1">
            Real-time operations dashboard — unified view of all SmartSend systems
          </p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* System Health Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={getHeatIndexBg(data.heat_index)}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5" />
              System Heat Index
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${getHeatIndexColor(data.heat_index)}`}>
              {data.heat_index}%
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Load across SmartSend systems
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-5 w-5" />
              Deliverability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${getReputationColor(data.deliverability.avg_reputation)}`}>
              {data.deliverability.avg_reputation.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Average domain reputation
            </p>
            <div className="mt-2 text-xs text-gray-600">
              <div>Bounces (24h): {data.deliverability.bounces_24h}</div>
              <div>Unsubs (24h): {data.deliverability.unsubs_24h}</div>
              <div>Sent (24h): {data.deliverability.sent_24h}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="mr-2 h-5 w-5" />
              Hot Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-orange-600">
              {data.hot_accounts.length}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Companies showing buying intent (score ≥ 5)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Real-Time Queue Monitor */}
      <Card>
        <CardHeader>
          <CardTitle>Global Send Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg bg-blue-50">
              <div className="flex items-center justify-center mb-2">
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-blue-600">{data.queue.pending}</div>
              <div className="text-xs text-gray-600 mt-1">Pending</div>
            </div>

            <div className="text-center p-4 border rounded-lg bg-yellow-50">
              <div className="flex items-center justify-center mb-2">
                <Activity className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="text-3xl font-bold text-yellow-600">{data.queue.processing}</div>
              <div className="text-xs text-gray-600 mt-1">Processing</div>
            </div>

            <div className="text-center p-4 border rounded-lg bg-red-50">
              <div className="flex items-center justify-center mb-2">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <div className="text-3xl font-bold text-red-600">{data.queue.failed}</div>
              <div className="text-xs text-gray-600 mt-1">Failed</div>
            </div>

            <div className="text-center p-4 border rounded-lg bg-orange-50">
              <div className="flex items-center justify-center mb-2">
                <RefreshCw className="h-8 w-8 text-orange-600" />
              </div>
              <div className="text-3xl font-bold text-orange-600">{data.queue.retries}</div>
              <div className="text-xs text-gray-600 mt-1">Retries</div>
            </div>
          </div>

          {data.queue.oldest && (
            <div className="mt-4 text-sm text-gray-600">
              <div>Oldest scheduled: {new Date(data.queue.oldest).toLocaleString()}</div>
              {data.queue.newest && (
                <div>Newest scheduled: {new Date(data.queue.newest).toLocaleString()}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hot Accounts Overview */}
      {data.hot_accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5" />
              Hot Accounts Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-auto">
              {data.hot_accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{account.name || account.domain || "Unknown"}</div>
                    {account.domain && (
                      <div className="text-xs text-gray-500">{account.domain}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-orange-600">
                    Intent: {account.intent_score}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SmartList Performance */}
      {data.smartlists.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <List className="mr-2 h-5 w-5" />
              SmartList Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.smartlists.map((sl) => (
                <div
                  key={sl.id}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{sl.name}</div>
                    {sl.last_refreshed && (
                      <div className="text-xs text-gray-500">
                        Last refreshed: {new Date(sl.last_refreshed).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {sl.lead_count} leads
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Zap className="mr-2 h-5 w-5" />
            AI Activity Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-auto">
            {data.ai_events.length > 0 ? (
              data.ai_events.map((event) => (
                <div
                  key={event.id}
                  className="py-2 border-b last:border-b-0 text-sm"
                >
                  <div className="font-medium">{formatEventType(event.event_type)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                  {event.meta && Object.keys(event.meta).length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      {JSON.stringify(event.meta)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No recent AI activity
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button onClick={() => router.push("/dashboard/inbox")} variant="outline">
              Replies Inbox
            </Button>
            <Button onClick={() => router.push("/dashboard/queue")} variant="outline">
              Queue
            </Button>
            <Button onClick={() => router.push("/dashboard/campaigns")} variant="outline">
              Campaigns
            </Button>
            <Button onClick={() => router.push("/dashboard/leads")} variant="outline">
              Leads
            </Button>
            <Button onClick={() => router.push("/dashboard/deliverability")} variant="outline">
              Deliverability
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}












