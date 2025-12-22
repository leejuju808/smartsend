// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// Component: Financing Dashboard for Contractors

"use client";

import { useState, useEffect } from "react";
import { CreditCard, TrendingUp, Users, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface FinancingDashboardProps {
  workspaceId: string;
}

interface DashboardStats {
  total_viewed: number;
  prequal_rate: number;
  approval_rate: number;
  revenue_closed: number;
  abandonment_rate: number;
  total_clicked: number;
  total_started: number;
  total_approved: number;
}

interface RecentActivity {
  id: string;
  clicked: boolean;
  started: boolean;
  prequalified: boolean;
  approved: boolean;
  declined: boolean;
  abandoned: boolean;
  monthly_payment: number | null;
  apr: number | null;
  plan_length: number | null;
  created_at: string;
  proposals?: {
    id: string;
    proposal_data: any;
    leads?: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export function FinancingDashboard({ workspaceId }: FinancingDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchDashboard();
  }, [workspaceId, days]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/financing/dashboard?workspace_id=${workspaceId}&days=${days}`
      );
      const data = await response.json();
      setStats(data.stats);
      setRecentActivities(data.recent_activities || []);
    } catch (error) {
      console.error("Error fetching financing dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 text-center text-gray-500">
        No financing data available yet.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Financing Dashboard</h2>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Viewed
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_viewed || 0}</div>
            <p className="text-xs text-muted-foreground">
              Homeowners who viewed financing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pre-Qual Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.prequal_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Clicked → Pre-qualified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.approval_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Started → Approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Closed</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(stats.revenue_closed || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              From financed jobs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Clicked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total_clicked || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total_started || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats.total_approved || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abandonment Rate Warning */}
      {stats.abandonment_rate > 30 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900 mb-1">
              High Abandonment Rate
            </h3>
            <p className="text-sm text-yellow-800">
              {stats.abandonment_rate.toFixed(1)}% of homeowners clicked
              financing but didn't complete. Consider simplifying the application
              process or adding more follow-ups.
            </p>
          </div>
        </div>
      )}

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Financing Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No recent financing activity
              </p>
            ) : (
              recentActivities.map((activity) => {
                const leadName =
                  activity.proposals?.leads?.name ||
                  activity.proposals?.proposal_data?.homeowner_name ||
                  "Unknown";
                const status = activity.approved
                  ? "Approved"
                  : activity.declined
                  ? "Declined"
                  : activity.prequalified
                  ? "Pre-qualified"
                  : activity.started
                  ? "Started"
                  : activity.clicked
                  ? "Clicked"
                  : "Unknown";

                return (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{leadName}</p>
                      <p className="text-xs text-gray-500">
                        {status} •{" "}
                        {new Date(activity.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    {activity.monthly_payment && (
                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          ${activity.monthly_payment.toLocaleString()}/mo
                        </p>
                        {activity.plan_length && (
                          <p className="text-xs text-gray-500">
                            {activity.plan_length} months
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
































