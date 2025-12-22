"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
import { ArrowLeft, Shield, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

type CrewPerformance = {
  crews: Array<{
    crewId: string;
    name: string;
    metrics: {
      safetyScore: number;
      jobsCompleted: number;
      totalJobsAssigned: number;
      overallScore: number;
      avgHoursPerJob: number;
      onTimePercentage: number;
      qualityScore: number;
      revenueGenerated: number;
    };
    ranking: "elite" | "reliable" | "needs_coaching" | "at_risk";
  }>;
  summary: {
    totalCrews: number;
    eliteCrews: number;
    atRiskCrews: number;
    avgSafetyScore: number;
  };
};

export default function CrewPerformancePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [crewData, setCrewData] = useState<CrewPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    if (!workspaceId) return;

    const loadCrews = async () => {
      try {
        const res = await fetch(`/api/analytics/ceo-dashboard/crews?wid=${workspaceId}`);
        if (!res.ok) throw new Error("Failed to fetch crew performance");
        const data = await res.json();
        setCrewData(data);
      } catch (error) {
        console.error("Error loading crew performance:", error);
      } finally {
        setLoading(false);
      }
    };

    loadCrews();
  }, [workspaceId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getRankingIcon = (ranking: string) => {
    switch (ranking) {
      case "elite":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "reliable":
        return <Shield className="h-5 w-5 text-blue-600" />;
      case "needs_coaching":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case "at_risk":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getRankingColor = (ranking: string) => {
    switch (ranking) {
      case "elite":
        return "bg-green-100 text-green-800 border-green-300";
      case "reliable":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "needs_coaching":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "at_risk":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading crew performance...</div>
      </div>
    );
  }

  if (!crewData) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No data available.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/analytics/ceo-command-center">
            <ArrowLeft className="h-5 w-5 cursor-pointer" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Crew Performance Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Safety scores, completion times, productivity indicators
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Crews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{crewData.summary.totalCrews}</div>
            <p className="text-xs text-muted-foreground mt-1">Active crews</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Elite Crews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {crewData.summary.eliteCrews}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Score ≥ 80</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">At Risk Crews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {crewData.summary.atRiskCrews}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Score &lt; 40</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg Safety Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {crewData.summary.avgSafetyScore.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Company average</p>
          </CardContent>
        </Card>
      </div>

      {/* Crews Table */}
      <Card>
        <CardHeader>
          <CardTitle>Crew Performance Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Crew</th>
                  <th className="text-center p-2">Ranking</th>
                  <th className="text-right p-2">Safety Score</th>
                  <th className="text-right p-2">Jobs Completed</th>
                  <th className="text-right p-2">On-Time %</th>
                  <th className="text-right p-2">Quality Score</th>
                  <th className="text-right p-2">Avg Hours/Job</th>
                  <th className="text-right p-2">Revenue Generated</th>
                  <th className="text-right p-2">Overall Score</th>
                </tr>
              </thead>
              <tbody>
                {crewData.crews.map((crew) => (
                  <tr key={crew.crewId} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{crew.name}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {getRankingIcon(crew.ranking)}
                        <span className={`px-2 py-1 rounded text-xs border ${getRankingColor(crew.ranking)}`}>
                          {crew.ranking.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="text-right p-2">
                      <div className="flex items-center justify-end gap-1">
                        {crew.metrics.safetyScore >= 80 ? (
                          <Shield className="h-4 w-4 text-green-600" />
                        ) : crew.metrics.safetyScore < 60 ? (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        ) : null}
                        {crew.metrics.safetyScore.toFixed(1)}
                      </div>
                    </td>
                    <td className="text-right p-2">
                      {crew.metrics.jobsCompleted} / {crew.metrics.totalJobsAssigned}
                    </td>
                    <td className="text-right p-2">
                      {crew.metrics.onTimePercentage.toFixed(1)}%
                    </td>
                    <td className="text-right p-2">
                      {crew.metrics.qualityScore.toFixed(1)}
                    </td>
                    <td className="text-right p-2">
                      {crew.metrics.avgHoursPerJob.toFixed(1)} hrs
                    </td>
                    <td className="text-right p-2 font-medium">
                      {formatCurrency(crew.metrics.revenueGenerated)}
                    </td>
                    <td className="text-right p-2">
                      <span className={`font-bold ${
                        crew.metrics.overallScore >= 80 ? 'text-green-600' :
                        crew.metrics.overallScore >= 60 ? 'text-blue-600' :
                        crew.metrics.overallScore >= 40 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {crew.metrics.overallScore.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

























