// Block 67000 — Crew Scorecards Component
// Detailed performance breakdown for each crew member

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CrewScorecardsProps {
  workspaceId: string;
}

interface CrewMemberScorecard {
  crew_member_id: string;
  name: string;
  crew_name: string;
  skills: {
    tear_off?: number;
    shingle_installation?: number;
    flashing?: number;
    ventilation?: number;
    ridge?: number;
    cleanup?: number;
    safety?: number;
    time_management?: number;
    overall?: number;
  };
  jobs_assessed: number;
  improvement_percentage: number | null;
  pending_training: number;
  last_assessed_at: string | null;
}

export function CrewScorecards({ workspaceId }: CrewScorecardsProps) {
  const [scorecards, setScorecards] = useState<CrewMemberScorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrewMember, setSelectedCrewMember] = useState<string | null>(null);

  useEffect(() => {
    fetchScorecards();
  }, [workspaceId]);

  async function fetchScorecards() {
    try {
      const response = await fetch(`/api/crew/scorecards?workspace_id=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setScorecards(data.scorecards || []);
      } else {
        // Fallback: fetch from view
        const supabase = createClient();
        const { data } = await supabase
          .from('v_crew_member_performance_summary')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('overall', { ascending: false, nullsLast: true });

        if (data) {
          setScorecards(data.map((item: any) => ({
            crew_member_id: item.crew_member_id,
            name: item.crew_member_name,
            crew_name: item.crew_name,
            skills: {
              tear_off: item.tear_off,
              shingle_installation: item.shingle_installation,
              flashing: item.flashing,
              ventilation: item.ventilation,
              ridge: item.ridge,
              cleanup: item.cleanup,
              safety: item.safety,
              time_management: item.time_management,
              overall: item.overall
            },
            jobs_assessed: item.jobs_assessed_count || 0,
            improvement_percentage: item.latest_improvement_percentage,
            pending_training: item.pending_training_count || 0,
            last_assessed_at: item.last_assessed_at
          })));
        }
      }
    } catch (error) {
      console.error('Error fetching scorecards:', error);
    } finally {
      setLoading(false);
    }
  }

  function getSkillColor(score: number | undefined): string {
    if (!score) return 'text-slate-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 70) return 'text-green-500';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  }

  const skillLabels = {
    tear_off: 'Tear-Off Speed',
    shingle_installation: 'Shingle Installation',
    flashing: 'Flashing Work',
    ventilation: 'Ventilation Setup',
    ridge: 'Ridge Cap Alignment',
    cleanup: 'Cleanup Quality',
    safety: 'Safety Compliance',
    time_management: 'Time Management'
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading scorecards...</div>;
  }

  if (scorecards.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No crew member performance data available. Run performance analysis to generate scorecards.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scorecards.map((member) => (
        <Card key={member.crew_member_id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{member.name}</CardTitle>
                <p className="text-sm text-slate-500 mt-1">{member.crew_name}</p>
              </div>
              <div className="flex items-center gap-4">
                {member.improvement_percentage !== null && (
                  <div className={`flex items-center gap-1 ${member.improvement_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {member.improvement_percentage >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">
                      {member.improvement_percentage > 0 ? '+' : ''}
                      {member.improvement_percentage}%
                    </span>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900">
                    {member.skills.overall !== undefined ? Math.round(member.skills.overall) : '—'}
                  </div>
                  <div className="text-xs text-slate-500">Overall Score</div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {Object.entries(skillLabels).map(([key, label]) => {
                const score = member.skills[key as keyof typeof member.skills];
                return (
                  <div key={key} className="border rounded-lg p-3">
                    <div className="text-xs text-slate-600 mb-1">{label}</div>
                    <div className={`text-xl font-bold ${getSkillColor(score)}`}>
                      {score !== undefined ? Math.round(score) : '—'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">/100</div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span>{member.jobs_assessed} jobs assessed</span>
                {member.pending_training > 0 && (
                  <span className="flex items-center gap-1 text-orange-600">
                    <AlertCircle className="h-4 w-4" />
                    {member.pending_training} training recommendations
                  </span>
                )}
                {member.pending_training === 0 && member.skills.overall && member.skills.overall >= 80 && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Performing well
                  </span>
                )}
              </div>
              {member.last_assessed_at && (
                <div className="text-xs text-slate-400">
                  Last assessed: {new Date(member.last_assessed_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}




























