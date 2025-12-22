"use client";

// Block 254000 — SmartSend Productivity Engine v1
// Crew Leaderboard Page

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, TrendingDown, Users } from "lucide-react";
import Link from "next/link";

interface CrewLeaderboardEntry {
  rank: number;
  crew_id: string;
  crew_name: string;
  score: number;
  rating_tier: string;
  component_scores: {
    install_speed: number;
    qc_quality: number;
    material_waste: number;
    on_time_rate: number;
    safety: number;
  };
  jobs_count: number;
  period: {
    start: string;
    end: string;
  };
}

export default function CrewLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<CrewLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    loadLeaderboard();
  }, [period]);

  const loadLeaderboard = async () => {
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
        fetchLeaderboard(workspace.workspace_id);
      } else {
        setLoading(false);
      }
    } else {
      setWorkspaceId(activeWorkspace);
      fetchLeaderboard(activeWorkspace);
    }
  };

  const fetchLeaderboard = async (wsId: string) => {
    try {
      const response = await fetch(
        `/api/productivity/crews/leaderboard?workspace_id=${wsId}&period=${period}`
      );
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard || []);
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
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

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="h-5 w-5 text-orange-600" />;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading crew leaderboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Crew Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance rankings and efficiency scores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Period:</label>
          <select
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Crew Rankings
          </CardTitle>
          <CardDescription>
            Ranked by efficiency score (0-100) over the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No crew data available for this period
            </p>
          ) : (
            <div className="space-y-4">
              {leaderboard.map((crew) => (
                <Link
                  key={crew.crew_id}
                  href={`/dashboard/productivity/crews/${crew.crew_id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      {/* Rank */}
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted font-bold text-lg">
                        {crew.rank <= 3 ? (
                          getRankIcon(crew.rank)
                        ) : (
                          <span>{crew.rank}</span>
                        )}
                      </div>

                      {/* Crew Info */}
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{crew.crew_name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`${getRatingColor(crew.rating_tier)} text-white border-0`}
                          >
                            {getRatingLabel(crew.rating_tier)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {crew.jobs_count} job{crew.jobs_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Component Scores */}
                      <div className="hidden md:grid grid-cols-5 gap-4 text-sm">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Speed</div>
                          <div className="font-semibold">{crew.component_scores.install_speed}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">QC</div>
                          <div className="font-semibold">{crew.component_scores.qc_quality}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Waste</div>
                          <div className="font-semibold">{crew.component_scores.material_waste}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">On-Time</div>
                          <div className="font-semibold">{crew.component_scores.on_time_rate}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Safety</div>
                          <div className="font-semibold">{crew.component_scores.safety}</div>
                        </div>
                      </div>

                      {/* Overall Score */}
                      <div className={`text-3xl font-bold ${getScoreColor(crew.score)}`}>
                        {crew.score}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              <strong>Install Speed (35%):</strong> How fast the crew completes tasks compared to baseline
            </div>
            <div>
              <strong>QC Quality (25%):</strong> Quality control scores from inspections
            </div>
            <div>
              <strong>Material Waste (15%):</strong> Efficiency in material usage (lower waste = higher score)
            </div>
            <div>
              <strong>On-Time Rate (15%):</strong> Percentage of jobs completed on schedule
            </div>
            <div>
              <strong>Safety (10%):</strong> Safety compliance and incident scores
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}























