/**
 * Block 256500 — AI Project Manager Assistant v1
 * GET /api/pm-assistant/dashboard - Get PM Dashboard with all active jobs and status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const pm_id = searchParams.get('pm_id');
    const company_id = searchParams.get('company_id');

    if (!pm_id && !company_id) {
      return NextResponse.json(
        { error: 'pm_id or company_id is required' },
        { status: 400 }
      );
    }

    // Get PM record
    let pmQuery = supabase
      .from('project_managers')
      .select('*')
      .eq('is_active', true);

    if (pm_id) {
      pmQuery = pmQuery.eq('id', pm_id);
    } else if (company_id) {
      pmQuery = pmQuery.eq('company_id', company_id).eq('user_id', user.id);
    }

    const { data: pm, error: pmError } = await pmQuery.single();

    if (pmError || !pm) {
      return NextResponse.json(
        { error: 'Project manager not found' },
        { status: 404 }
      );
    }

    // Get active jobs for this PM
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        address,
        homeowner_name,
        production_date,
        progress,
        stage,
        crew_id,
        crews:crew_id (id, name),
        company_id
      `)
      .eq('company_id', pm.company_id)
      .in('stage', ['scheduled', 'in_progress', 'materials', 'production'])
      .order('production_date', { ascending: true, nullsFirst: false });

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      return NextResponse.json(
        { error: jobsError.message },
        { status: 500 }
      );
    }

    // Get health scores for all jobs
    const jobIds = jobs?.map(j => j.id) || [];
    const { data: healthScores, error: healthError } = await supabase
      .from('job_health_scores')
      .select('*')
      .in('job_id', jobIds)
      .order('calculated_at', { ascending: false });

    if (healthError) {
      console.error('Error fetching health scores:', healthError);
    }

    // Get latest health score per job
    const latestHealthScores = new Map();
    healthScores?.forEach(score => {
      if (!latestHealthScores.has(score.job_id) || 
          new Date(score.calculated_at) > new Date(latestHealthScores.get(score.job_id).calculated_at)) {
        latestHealthScores.set(score.job_id, score);
      }
    });

    // Get active alerts
    const { data: alerts, error: alertsError } = await supabase
      .from('pm_alerts')
      .select('*')
      .eq('pm_id', pm.id)
      .eq('status', 'active')
      .order('severity', { ascending: true })
      .order('created_at', { ascending: false });

    if (alertsError) {
      console.error('Error fetching alerts:', alertsError);
    }

    // Get pending tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('pm_tasks')
      .select('*')
      .eq('pm_id', pm.id)
      .in('status', ['open', 'in_progress'])
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
    }

    // Build job status cards
    const jobStatusCards = (jobs || []).map(job => {
      const healthScore = latestHealthScores.get(job.id);
      const jobAlerts = alerts?.filter(a => a.job_id === job.id) || [];
      const jobTasks = tasks?.filter(t => t.job_id === job.id) || [];

      let status = 'ON_TRACK';
      if (healthScore) {
        if (healthScore.status === 'critical') {
          status = 'CRITICAL';
        } else if (healthScore.status === 'at_risk') {
          status = 'AT_RISK';
        }
      }

      return {
        job_id: job.id,
        job_number: job.id.toString().substring(0, 8),
        address: job.address,
        homeowner_name: job.homeowner_name,
        production_date: job.production_date,
        progress: job.progress || 0,
        stage: job.stage,
        crew: job.crews ? { id: job.crews.id, name: job.crews.name } : null,
        health_score: healthScore?.score || null,
        health_status: healthScore?.status || 'unknown',
        status: status,
        alerts_count: jobAlerts.length,
        critical_alerts_count: jobAlerts.filter(a => a.severity === 'critical').length,
        tasks_count: jobTasks.length,
        high_priority_tasks_count: jobTasks.filter(t => t.priority === 'high').length,
      };
    });

    // Get daily briefing
    const { data: briefing, error: briefingError } = await supabase
      .from('pm_daily_briefings')
      .select('*')
      .eq('pm_id', pm.id)
      .eq('briefing_date', new Date().toISOString().split('T')[0])
      .single();

    if (briefingError && briefingError.code !== 'PGRST116') {
      console.error('Error fetching briefing:', briefingError);
    }

    // Generate briefing if it doesn't exist
    let dailyBriefing = briefing;
    if (!briefing) {
      const { data: newBriefing, error: generateError } = await supabase.rpc(
        'generate_pm_daily_briefing',
        { p_pm_id: pm.id, p_date: new Date().toISOString().split('T')[0] }
      );

      if (!generateError && newBriefing) {
        const { data: fetchedBriefing } = await supabase
          .from('pm_daily_briefings')
          .select('*')
          .eq('id', newBriefing)
          .single();
        dailyBriefing = fetchedBriefing;
      }
    }

    return NextResponse.json({
      ok: true,
      pm: {
        id: pm.id,
        name: `${pm.first_name} ${pm.last_name}`,
        email: pm.email,
      },
      dashboard: {
        job_status_cards: jobStatusCards,
        daily_briefing: dailyBriefing || null,
        summary: {
          total_active_jobs: jobStatusCards.length,
          critical_jobs: jobStatusCards.filter(j => j.status === 'CRITICAL').length,
          at_risk_jobs: jobStatusCards.filter(j => j.status === 'AT_RISK').length,
          on_track_jobs: jobStatusCards.filter(j => j.status === 'ON_TRACK').length,
          total_alerts: alerts?.length || 0,
          critical_alerts: alerts?.filter(a => a.severity === 'critical').length || 0,
          pending_tasks: tasks?.length || 0,
          high_priority_tasks: tasks?.filter(t => t.priority === 'high').length || 0,
        },
        alerts: alerts || [],
        tasks: tasks || [],
      },
    });
  } catch (error: any) {
    console.error('Error in PM dashboard API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















