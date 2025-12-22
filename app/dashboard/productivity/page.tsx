"use client";

// Block 254000 — SmartSend Productivity Engine v1
// Daily Productivity Dashboard Page

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, TrendingDown, Clock, Users } from "lucide-react";

interface DashboardData {
  today_productivity_score: number;
  crew_rankings: Array<{
    crew_id: string;
    crew_name: string;
    score: number;
    rating_tier: string;
  }>;
  jobs_behind_schedule: Array<{
    job_id: string;
    job_title: string;
    bottleneck_type: string;
    severity: string;
    description: string;
    estimated_delay_minutes: number;
  }>;
  total_crews: number;
  flagged_crews: number;
}

export default function ProductivityDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    const supabase = createClient();

    // Get active workspace
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get workspace
    const activeWorkspace =
      typeof window !== "undefined"
        ? localStorage.getItem("active_workspace")
        : null;

    if (!activeWorkspace) {
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (workspace) {
        setWorkspaceId(workspace.workspace_id);
        fetchDashboardData(workspace.workspace_id);
      } else {
        setLoading(false);
      }
    } else {
      setWorkspaceId(activeWorkspace);
      fetchDashboardData(activeWorkspace);
    }
  };

  const fetchDashboardData = async (wsId: string) => {
    try {
      const response = await fetch(`/api/productivity/dashboard?workspace_id=${wsId}`);
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRatingColor = (tier: string) => {
    switch (tier) {
      case "elite":
        return "bg-green-500";
      case "strong":
        return "bg-blue-500";
      case "average":
        return "bg-yellow-500";
      case "needs_improvement":
        return "bg-orange-500";
      case "high_risk":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getRatingLabel = (tier: string) => {
    switch (tier) {
      case "elite":
        return "Elite";
      case "strong":
        return "Strong";
      case "average":
        return "Average";
      case "needs_improvement":
        return "Needs Improvement";
      case "high_risk":
        return "High Risk";
      default:
        return "Unknown";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 80) return "text-blue-600";
    if (score >= 70) return "text-yellow-600";
    if (score >= 60) return "text-orange-600";
    return "text-red-600";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading productivity data...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Data Available</AlertTitle>
          <AlertDescription>
            Unable to load productivity data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productivity Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time crew performance and job status intelligence
          </p>
        </div>
      </div>

      {/* Today's Productivity Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Today's Productivity Score
          </CardTitle>
          <CardDescription>
            Average efficiency across all active crews
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-4">
            <div className={`text-6xl font-bold ${getScoreColor(dashboardData.today_productivity_score)}`}>
              {dashboardData.today_productivity_score}
            </div>
            <div className="text-sm text-muted-foreground">
              <div>Out of 100</div>
              <div className="mt-1">
                {dashboardData.total_crews} crew{dashboardData.total_crews !== 1 ? "s" : ""} tracked
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crew Rankings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Crew Rankings
          </CardTitle>
          <CardDescription>
            Performance leaderboard for all crews
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardData.crew_rankings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No crew data available</p>
          ) : (
            <div className="space-y-3">
              {dashboardData.crew_rankings.map((crew, index) => (
                <div
                  key={crew.crew_id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold">{crew.crew_name}</div>
                      <Badge
                        variant="outline"
                        className={`mt-1 ${getRatingColor(crew.rating_tier)} text-white border-0`}
                      >
                        {getRatingLabel(crew.rating_tier)}
                      </Badge>
                    </div>
                  </div>
                  <div className={`text-2xl font-bold ${getScoreColor(crew.score)}`}>
                    {crew.score}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jobs Behind Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Jobs Behind Schedule
          </CardTitle>
          <CardDescription>
            Active bottlenecks and delays requiring attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardData.jobs_behind_schedule.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">All jobs on track!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.jobs_behind_schedule.map((job) => (
                <Alert
                  key={job.job_id}
                  className={getSeverityColor(job.severity)}
                >
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="font-semibold">{job.job_title}</AlertTitle>
                  <AlertDescription className="mt-2">
                    <div className="text-sm">{job.description}</div>
                    {job.estimated_delay_minutes && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <Clock className="h-3 w-3" />
                        Estimated delay: {Math.round(job.estimated_delay_minutes / 60)} hours
                        {job.estimated_delay_minutes % 60 > 0 &&
                          ` ${job.estimated_delay_minutes % 60} minutes`}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Crews</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboardData.total_crews}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Flagged Crews</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {dashboardData.flagged_crews}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Jobs Behind Schedule</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {dashboardData.jobs_behind_schedule.length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}























