// Block 254100 — Operations AI Director: Preventative Alerts
// GET /api/operations-ai/preventative-alerts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { OperationsAIDirector } from '@/lib/ai/operations-director';

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing required parameter: workspaceId' },
        { status: 400 }
      );
    }

    // Get active jobs
    const { data: jobs } = await supabase
      .from('roofing_jobs')
      .select('id, scheduled_start_date, crew_id, title')
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'in_progress'])
      .limit(50);

    // Get weather warnings
    const weatherWarnings: any[] = [];
    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map(j => j.id);
      const { data: weather } = await supabase
        .from('weather_intelligence')
        .select('job_id, forecast_date, forecast_summary, risk_level')
        .in('job_id', jobIds)
        .gte('forecast_date', new Date().toISOString().split('T')[0])
        .lte('forecast_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .in('risk_level', ['high', 'critical']);

      if (weather) {
        weatherWarnings.push(...weather.map((w: any) => ({
          date: w.forecast_date,
          type: w.forecast_summary || 'Weather warning',
          severity: w.risk_level
        })));
      }
    }

    // Get crew performance data
    const crewPerformance: any[] = [];
    if (jobs && jobs.length > 0) {
      const crewIds = [...new Set(jobs.map(j => j.crew_id).filter(Boolean))];
      
      for (const crewId of crewIds) {
        const { data: crew } = await supabase
          .from('crews')
          .select('id, name')
          .eq('id', crewId)
          .single();

        if (crew) {
          const { data: efficiency } = await supabase
            .from('crew_efficiency_scores')
            .select('score, safety_score')
            .eq('crew_id', crewId)
            .eq('workspace_id', workspaceId)
            .gte('period_end', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('period_end', { ascending: false })
            .limit(1)
            .single();

          if (efficiency && (efficiency.safety_score < 70 || efficiency.score < 60)) {
            crewPerformance.push({
              crewId: crew.id,
              crewName: crew.name || 'Unnamed Crew',
              safetyScore: efficiency.safety_score || 50,
              efficiencyScore: efficiency.score || 50
            });
          }
        }
      }
    }

    // Get material delivery status
    const materialDeliveries: any[] = [];
    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map(j => j.id);
      const { data: orders } = await supabase
        .from('supplier_orders')
        .select('job_id, delivery_date, status, created_at')
        .in('job_id', jobIds)
        .in('status', ['delayed', 'pending']);

      if (orders) {
        for (const order of orders) {
          if (order.status === 'delayed' && order.delivery_date) {
            const delayMinutes = Math.max(0, Math.floor(
              (new Date(order.delivery_date).getTime() - new Date(order.created_at).getTime()) / (1000 * 60)
            ));
            
            materialDeliveries.push({
              jobId: order.job_id,
              deliveryDate: order.delivery_date,
              status: order.status,
              delayMinutes
            });
          }
        }
      }
    }

    // Generate alerts using AI
    const alerts = await OperationsAIDirector.generatePreventativeAlerts({
      workspaceId,
      jobs: jobs || [],
      weatherWarnings,
      crewPerformance,
      materialDeliveries
    });

    // Save alerts to database
    if (alerts.length > 0) {
      const alertsToInsert = alerts.map(alert => ({
        workspace_id: workspaceId,
        job_id: alert.alert_data.job_id || null,
        crew_id: alert.alert_data.crew_id || null,
        alert_type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        alert_data: alert.alert_data
      }));

      await supabase
        .from('ai_preventative_alerts')
        .insert(alertsToInsert);
    }

    return NextResponse.json({
      alerts,
      count: alerts.length
    });
  } catch (error: any) {
    console.error('Error generating preventative alerts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate alerts' },
      { status: 500 }
    );
  }
}






















