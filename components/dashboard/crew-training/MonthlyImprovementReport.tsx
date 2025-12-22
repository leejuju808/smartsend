// Block 67000 — Monthly Improvement Report Component
// Shows improvement trends over time

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, TrendingDown, Award, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MonthlyImprovementReportProps {
  workspaceId: string;
}

interface ImprovementData {
  period_start: string;
  period_end: string;
  overall_score: number;
  improvement_percentage: number | null;
  jobs_completed: number;
  strongest_skill: string;
  weakest_skill: string;
}

export function MonthlyImprovementReport({ workspaceId }: MonthlyImprovementReportProps) {
  const [improvementData, setImprovementData] = useState<ImprovementData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchImprovementData();
  }, [workspaceId]);

  async function fetchImprovementData() {
    try {
      const supabase = createClient();
      
      // Get last 6 months of performance history
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const { data } = await supabase
        .from('crew_performance_history')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('snapshot_type', 'monthly')
        .gte('snapshot_period_start', sixMonthsAgo.toISOString().split('T')[0])
        .order('snapshot_period_start', { ascending: true });

      if (data) {
        const processed = data.map((item: any) => ({
          period_start: item.snapshot_period_start,
          period_end: item.snapshot_period_end,
          overall_score: item.skill_snapshot?.overall || 0,
          improvement_percentage: item.improvement_percentage,
          jobs_completed: item.jobs_completed || 0,
          strongest_skill: item.strongest_skill,
          weakest_skill: item.weakest_skill
        }));
        
        setImprovementData(processed);
      }
    } catch (error) {
      console.error('Error fetching improvement data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading improvement report...</div>;
  }

  if (improvementData.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No improvement data available. Performance history will appear after running monthly snapshots.</p>
      </div>
    );
  }

  const latest = improvementData[improvementData.length - 1];
  const previous = improvementData.length > 1 ? improvementData[improvementData.length - 2] : null;

  // Prepare chart data
  const chartData = improvementData.map(item => ({
    period: new Date(item.period_start).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    overall_score: item.overall_score,
    jobs_completed: item.jobs_completed
  }));

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-slate-600 mb-1">Current Score</div>
          <div className="text-2xl font-bold text-slate-900">{latest.overall_score}/100</div>
        </div>
        
        {latest.improvement_percentage !== null && (
          <div className="border rounded-lg p-4">
            <div className="text-sm text-slate-600 mb-1">This Month</div>
            <div className={`flex items-center gap-1 text-xl font-bold ${
              latest.improvement_percentage >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {latest.improvement_percentage >= 0 ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
              {latest.improvement_percentage > 0 ? '+' : ''}
              {latest.improvement_percentage}%
            </div>
          </div>
        )}
        
        <div className="border rounded-lg p-4">
          <div className="text-sm text-slate-600 mb-1">Jobs Completed</div>
          <div className="text-2xl font-bold text-slate-900">{latest.jobs_completed}</div>
        </div>
      </div>

      {/* Trend Chart */}
      {chartData.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Performance Trend (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '6px' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="overall_score"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Overall Score"
                dot={{ fill: '#3b82f6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-2 gap-4">
        {latest.strongest_skill && (
          <div className="border rounded-lg p-4 bg-green-50">
            <div className="flex items-center gap-2 text-green-700 mb-2">
              <Award className="h-4 w-4" />
              <span className="font-semibold">Strongest Skill</span>
            </div>
            <div className="text-lg font-bold text-green-900">
              {latest.strongest_skill.replace('_', ' ')}
            </div>
          </div>
        )}
        
        {latest.weakest_skill && (
          <div className="border rounded-lg p-4 bg-orange-50">
            <div className="flex items-center gap-2 text-orange-700 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Needs Improvement</span>
            </div>
            <div className="text-lg font-bold text-orange-900">
              {latest.weakest_skill.replace('_', ' ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




























