// Block 67000 — Crew Rankings Component
// Ranks crews from strongest to weakest

'use client';

import { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface CrewRankingsProps {
  workspaceId: string;
  limit?: number;
}

interface CrewRanking {
  rank: number;
  crew_id: string;
  crew_name: string;
  avg_quality_score: number;
  avg_completion_days: number;
  high_severity_alerts_count: number;
  avg_risk_score: number;
  avg_warranty_probability: number;
  jobs_completed_count: number;
  ranking_score: number;
}

export function CrewRankings({ workspaceId, limit }: CrewRankingsProps) {
  const [rankings, setRankings] = useState<CrewRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRankings();
  }, [workspaceId]);

  async function fetchRankings() {
    try {
      const response = await fetch(`/api/crew/rank?workspace_id=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        let crews = data.crews || [];
        
        if (limit) {
          crews = crews.slice(0, limit);
        }
        
        setRankings(crews);
      }
    } catch (error) {
      console.error('Error fetching rankings:', error);
    } finally {
      setLoading(false);
    }
  }

  function getRankBadge(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  function getQualityColor(score: number): string {
    if (score >= 80) return 'text-green-600';
    if (score >= 70) return 'text-green-500';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading rankings...</div>;
  }

  if (rankings.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No crew rankings available. Complete some jobs and run performance analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rankings.map((crew) => (
        <div
          key={crew.crew_id}
          className="border rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold text-slate-700 min-w-[40px]">
                {getRankBadge(crew.rank)}
              </div>
              <div>
                <div className="font-semibold text-slate-900">{crew.crew_name}</div>
                <div className="text-sm text-slate-500">
                  {crew.jobs_completed_count} jobs completed
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-lg font-bold ${getQualityColor(crew.avg_quality_score)}`}>
                  {Math.round(crew.avg_quality_score)}
                </div>
                <div className="text-xs text-slate-500">Quality</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-700">
                  {crew.avg_completion_days.toFixed(1)}d
                </div>
                <div className="text-xs text-slate-500">Avg Days</div>
              </div>
              {crew.high_severity_alerts_count > 0 && (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">{crew.high_severity_alerts_count}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Ranking Score Breakdown */}
          <div className="mt-3 pt-3 border-t text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>Risk Score: {Math.round(crew.avg_risk_score)}/100</span>
              <span>Warranty Probability: {Math.round(crew.avg_warranty_probability)}%</span>
              <span className="font-medium">Overall Ranking: {crew.ranking_score.toFixed(1)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}




























