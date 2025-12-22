/**
 * Block 19750 — Internal Inbox Monitor Dashboard
 * Private dashboard for monitoring inbox rollout
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Users,
  Mail,
  Zap,
  Calendar,
} from 'lucide-react';

interface MonitorStats {
  last24h: {
    active_users: number;
    replies_received: number;
    threads_created: number;
    failures: number;
    avg_processing_ms: number | null;
  };
  hotLeads: Array<{
    user_id: string;
    email: string;
    hot_leads_count: number;
    latest_capture: string;
  }>;
  failures: Array<{
    id: string;
    user_id: string;
    event_type: string;
    error_message: string;
    created_at: string;
  }>;
  openIssues: Array<{
    id: string;
    user_id: string | null;
    severity: string;
    issue_type: string;
    title: string;
    description: string;
    reported_at: string;
  }>;
  userSummary: Array<{
    user_id: string;
    email: string;
    beta_access_level: string;
    phase: string;
    enrolled_at: string;
    total_replies: number;
    total_threads_opened: number;
    total_calls: number;
    total_booked: number;
    sentiment_score: number;
    open_issues: number;
  }>;
}

export default function InboxMonitorPage() {
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/internal/inbox-monitor/stats');
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Internal users only.');
        } else {
          setError('Failed to load stats');
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError('Failed to load stats');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading monitoring dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const { last24h, hotLeads, failures, openIssues, userSummary } = stats;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inbox Rollout Monitor</h1>
        <p className="text-muted-foreground mt-2">
          Real-time monitoring of inbox deployment and beta rollout
        </p>
      </div>

      {/* Last 24 Hours Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{last24h.active_users}</div>
            <p className="text-xs text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Replies Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{last24h.replies_received}</div>
            <p className="text-xs text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Threads Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{last24h.threads_created}</div>
            <p className="text-xs text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{last24h.failures}</div>
            <p className="text-xs text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {last24h.avg_processing_ms
                ? `${Math.round(last24h.avg_processing_ms)}ms`
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>
      </div>

      {/* Hot Leads Today */}
      {hotLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Hot Leads Captured Today
            </CardTitle>
            <CardDescription>Leads with score ≥ 80</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hotLeads.map((lead) => (
                <div
                  key={lead.user_id}
                  className="flex items-center justify-between p-2 rounded-md bg-yellow-50"
                >
                  <div>
                    <div className="font-medium">{lead.email}</div>
                    <div className="text-sm text-muted-foreground">
                      {lead.hot_leads_count} hot lead{lead.hot_leads_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <Badge variant="outline">{lead.hot_leads_count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for detailed views */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">User Summary</TabsTrigger>
          <TabsTrigger value="issues">Open Issues</TabsTrigger>
          <TabsTrigger value="failures">Recent Failures</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User-by-User Breakdown</CardTitle>
              <CardDescription>All enrolled beta testers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userSummary.map((user) => (
                  <div
                    key={user.user_id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{user.email}</div>
                        <div className="text-sm text-muted-foreground">
                          Phase: <Badge variant="outline">{user.phase}</Badge> • Enrolled:{' '}
                          {new Date(user.enrolled_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge
                        variant={
                          user.beta_access_level === 'internal'
                            ? 'default'
                            : user.beta_access_level === 'founders'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {user.beta_access_level}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Replies</div>
                        <div className="font-medium">{user.total_replies}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Threads</div>
                        <div className="font-medium">{user.total_threads_opened}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Calls</div>
                        <div className="font-medium">{user.total_calls}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Booked</div>
                        <div className="font-medium">{user.total_booked}</div>
                      </div>
                    </div>
                    {user.open_issues > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>{user.open_issues} open issue(s)</AlertTitle>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Open Issues</CardTitle>
              <CardDescription>Issues requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              {openIssues.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No open issues 🎉
                </div>
              ) : (
                <div className="space-y-4">
                  {openIssues.map((issue) => (
                    <Alert
                      key={issue.id}
                      variant={issue.severity === 'severity_1' ? 'destructive' : 'default'}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{issue.title}</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <div>{issue.description}</div>
                        <div className="flex gap-2 text-xs">
                          <Badge variant="outline">{issue.severity}</Badge>
                          <Badge variant="outline">{issue.issue_type}</Badge>
                          <span className="text-muted-foreground">
                            {new Date(issue.reported_at).toLocaleString()}
                          </span>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failures" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Failures</CardTitle>
              <CardDescription>Last 20 failures</CardDescription>
            </CardHeader>
            <CardContent>
              {failures.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No failures in last 24h 🎉
                </div>
              ) : (
                <div className="space-y-2">
                  {failures.map((failure) => (
                    <div
                      key={failure.id}
                      className="border rounded-md p-3 text-sm"
                    >
                      <div className="font-medium text-red-600">{failure.event_type}</div>
                      <div className="text-muted-foreground mt-1">
                        {failure.error_message || 'Unknown error'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(failure.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



















































