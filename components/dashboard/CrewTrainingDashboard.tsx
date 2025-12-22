// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// Crew Training Dashboard Component

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Users, BookOpen, Award, AlertTriangle } from 'lucide-react';
import { SkillHeatmap } from './crew-training/SkillHeatmap';
import { CrewScorecards } from './crew-training/CrewScorecards';
import { TrainingLibrary } from './crew-training/TrainingLibrary';
import { MonthlyImprovementReport } from './crew-training/MonthlyImprovementReport';
import { CrewRankings } from './crew-training/CrewRankings';

interface CrewTrainingDashboardProps {
  workspaceId: string;
}

export function CrewTrainingDashboard({ workspaceId }: CrewTrainingDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetchSummary();
  }, [workspaceId]);

  async function fetchSummary() {
    try {
      const supabase = createClient();
      
      // Get crew rankings for summary
      const response = await fetch(`/api/crew/rank?workspace_id=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        
        // Calculate summary stats
        const totalCrews = data.crews?.length || 0;
        const avgQuality = data.crews?.reduce((sum: number, c: any) => sum + (c.avg_quality_score || 0), 0) / totalCrews || 0;
        const pendingTraining = 0; // Will be calculated from recommendations
        const improvingCrews = data.crews?.filter((c: any) => c.avg_quality_score > 75).length || 0;
        
        setSummary({
          totalCrews,
          avgQuality: Math.round(avgQuality),
          pendingTraining,
          improvingCrews
        });
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Crew Training & Skill Development</h1>
          <p className="text-sm text-slate-500 mt-1">
            AI-powered crew development coach • Skill gap detection • Training recommendations
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Crews</p>
                  <p className="text-2xl font-bold mt-1">{summary.totalCrews}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Avg Quality Score</p>
                  <p className="text-2xl font-bold mt-1">{summary.avgQuality}/100</p>
                </div>
                <Award className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Pending Training</p>
                  <p className="text-2xl font-bold mt-1">{summary.pendingTraining}</p>
                </div>
                <BookOpen className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Strong Performers</p>
                  <p className="text-2xl font-bold mt-1">{summary.improvingCrews}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="heatmap">Skill Heatmap</TabsTrigger>
          <TabsTrigger value="scorecards">Scorecards</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Crew Rankings</CardTitle>
              </CardHeader>
              <CardContent>
                <CrewRankings workspaceId={workspaceId} limit={5} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Improvement Report</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyImprovementReport workspaceId={workspaceId} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Skill Heatmap</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Visual overview of crew strengths and weaknesses across all skill areas
              </p>
            </CardHeader>
            <CardContent>
              <SkillHeatmap workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scorecards" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Crew Scorecards</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Detailed performance breakdown for each crew member
              </p>
            </CardHeader>
            <CardContent>
              <CrewScorecards workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rankings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Crew Rankings</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Ranked by quality, speed, risk, and warranty probability
              </p>
            </CardHeader>
            <CardContent>
              <CrewRankings workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Training Library & Recommendations</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                AI-recommended training modules based on skill gaps
              </p>
            </CardHeader>
            <CardContent>
              <TrainingLibrary workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}




























