/**
 * Block 256500 — AI Project Manager Assistant v1
 * PM Dashboard Page
 */

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingDown, 
  TrendingUp,
  MessageSquare,
  FileText,
  Calendar,
  Users,
  Package
} from 'lucide-react';

interface JobStatusCard {
  job_id: string;
  job_number: string;
  address: string;
  homeowner_name: string;
  production_date: string | null;
  progress: number;
  stage: string;
  crew: { id: string; name: string } | null;
  health_score: number | null;
  health_status: string;
  status: 'ON_TRACK' | 'AT_RISK' | 'CRITICAL';
  alerts_count: number;
  critical_alerts_count: number;
  tasks_count: number;
  high_priority_tasks_count: number;
}

interface DailyBriefing {
  id: string;
  summary: string;
  metrics: {
    active_jobs_count: number;
    delayed_jobs_count: number;
    critical_alerts_count: number;
    warning_alerts_count: number;
    pending_tasks_count: number;
    high_priority_tasks_count: number;
    material_issues_count: number;
    crew_communications_count: number;
    punch_list_items_pending: number;
    customer_updates_needed: number;
  };
}

interface PMDashboard {
  pm: {
    id: string;
    name: string;
    email: string;
  };
  dashboard: {
    job_status_cards: JobStatusCard[];
    daily_briefing: DailyBriefing | null;
    summary: {
      total_active_jobs: number;
      critical_jobs: number;
      at_risk_jobs: number;
      on_track_jobs: number;
      total_alerts: number;
      critical_alerts: number;
      pending_tasks: number;
      high_priority_tasks: number;
    };
    alerts: any[];
    tasks: any[];
  };
}

export default function PMAssistantDashboard() {
  const [dashboard, setDashboard] = useState<PMDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pmId, setPmId] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Get PM ID for current user
        const { data: pmData, error: pmError } = await supabase
          .from('project_managers')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single();

        if (pmError || !pmData) {
          setError('Project manager profile not found');
          setLoading(false);
          return;
        }

        setPmId(pmData.id);

        // Fetch dashboard data
        const response = await fetch(`/api/pm-assistant/dashboard?pm_id=${pmData.id}`);
        if (!response.ok) {
          throw new Error('Failed to load dashboard');
        }

        const data = await response.json();
        setDashboard(data);
      } catch (err: any) {
        console.error('Error loading dashboard:', err);
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading PM Dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'AT_RISK':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ON_TRACK':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getHealthScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-500';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PM Assistant Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {dashboard.pm.name}
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {dashboard.dashboard.summary.total_active_jobs} Active Jobs
        </Badge>
      </div>

      {/* Daily Briefing */}
      {dashboard.dashboard.daily_briefing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Daily PM Briefing
            </CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-line text-sm leading-relaxed">
              {dashboard.dashboard.daily_briefing.summary}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Critical Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {dashboard.dashboard.summary.critical_jobs}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              At Risk Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {dashboard.dashboard.summary.at_risk_jobs}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Critical Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {dashboard.dashboard.summary.critical_alerts}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              High Priority Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {dashboard.dashboard.summary.high_priority_tasks}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Status Cards */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Jobs ({dashboard.dashboard.job_status_cards.length})</TabsTrigger>
          <TabsTrigger value="critical">
            Critical ({dashboard.dashboard.summary.critical_jobs})
          </TabsTrigger>
          <TabsTrigger value="at-risk">
            At Risk ({dashboard.dashboard.summary.at_risk_jobs})
          </TabsTrigger>
          <TabsTrigger value="on-track">
            On Track ({dashboard.dashboard.summary.on_track_jobs})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.dashboard.job_status_cards.map((job) => (
              <Card key={job.job_id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">Job #{job.job_number}</CardTitle>
                      <CardDescription className="mt-1">
                        {job.address}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(job.status)}>
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Health Score</span>
                    <span className={`font-bold ${getHealthScoreColor(job.health_score)}`}>
                      {job.health_score !== null ? job.health_score : 'N/A'}
                    </span>
                  </div>
                  
                  {job.crew && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="h-4 w-4" />
                      <span>{job.crew.name}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {job.production_date 
                        ? new Date(job.production_date).toLocaleDateString()
                        : 'No date set'}
                    </span>
                  </div>

                  <div className="pt-2 border-t space-y-2">
                    {job.critical_alerts_count > 0 && (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{job.critical_alerts_count} critical alert(s)</span>
                      </div>
                    )}
                    
                    {job.high_priority_tasks_count > 0 && (
                      <div className="flex items-center gap-2 text-sm text-orange-600">
                        <Clock className="h-4 w-4" />
                        <span>{job.high_priority_tasks_count} high priority task(s)</span>
                      </div>
                    )}

                    {job.alerts_count > 0 && job.critical_alerts_count === 0 && (
                      <div className="flex items-center gap-2 text-sm text-yellow-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{job.alerts_count} alert(s)</span>
                      </div>
                    )}

                    {job.tasks_count > 0 && job.high_priority_tasks_count === 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="h-4 w-4" />
                        <span>{job.tasks_count} task(s)</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${job.progress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{job.progress}% complete</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="critical" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.dashboard.job_status_cards
              .filter(job => job.status === 'CRITICAL')
              .map((job) => (
                <Card key={job.job_id} className="hover:shadow-lg transition-shadow border-red-300">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Job #{job.job_number}</CardTitle>
                        <CardDescription className="mt-1">
                          {job.address}
                        </CardDescription>
                      </div>
                      <Badge className="bg-red-100 text-red-800 border-red-300">
                        CRITICAL
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Health Score</span>
                      <span className="font-bold text-red-600">
                        {job.health_score !== null ? job.health_score : 'N/A'}
                      </span>
                    </div>
                    {job.critical_alerts_count > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>{job.critical_alerts_count} Critical Alert(s)</AlertTitle>
                        <AlertDescription>
                          Immediate attention required
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="at-risk" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.dashboard.job_status_cards
              .filter(job => job.status === 'AT_RISK')
              .map((job) => (
                <Card key={job.job_id} className="hover:shadow-lg transition-shadow border-yellow-300">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Job #{job.job_number}</CardTitle>
                        <CardDescription className="mt-1">
                          {job.address}
                        </CardDescription>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                        AT RISK
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Health Score</span>
                      <span className="font-bold text-yellow-600">
                        {job.health_score !== null ? job.health_score : 'N/A'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="on-track" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.dashboard.job_status_cards
              .filter(job => job.status === 'ON_TRACK')
              .map((job) => (
                <Card key={job.job_id} className="hover:shadow-lg transition-shadow border-green-300">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Job #{job.job_number}</CardTitle>
                        <CardDescription className="mt-1">
                          {job.address}
                        </CardDescription>
                      </div>
                      <Badge className="bg-green-100 text-green-800 border-green-300">
                        ON TRACK
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Health Score</span>
                      <span className="font-bold text-green-600">
                        {job.health_score !== null ? job.health_score : 'N/A'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}





















