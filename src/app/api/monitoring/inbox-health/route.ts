import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Block 19730 — PART 5: Real-Time System Monitoring
 * 
 * API endpoint for monitoring inbox system health
 * Returns metrics for webhook events, AI worker health, and system status
 */

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Webhook Events Metrics (last hour)
    const { data: webhookEvents, error: webhookError } = await supabase
      .from('webhook_events_monitoring')
      .select('*')
      .gte('created_at', oneHourAgo.toISOString())
      .order('created_at', { ascending: false });

    const webhookMetrics = {
      total: webhookEvents?.length || 0,
      success: webhookEvents?.filter(e => e.success).length || 0,
      failed: webhookEvents?.filter(e => !e.success).length || 0,
      average_response_time_ms: webhookEvents?.length
        ? Math.round(
            webhookEvents.reduce((sum, e) => sum + (e.response_time_ms || 0), 0) /
            webhookEvents.length
          )
        : null,
      by_provider: webhookEvents?.reduce((acc: any, e) => {
        acc[e.provider || 'unknown'] = (acc[e.provider || 'unknown'] || 0) + 1;
        return acc;
      }, {}) || {},
    };

    // AI Worker Health Metrics (last hour)
    const { data: aiWorkerHealth, error: aiError } = await supabase
      .from('ai_worker_health_monitoring')
      .select('*')
      .gte('run_started_at', oneHourAgo.toISOString())
      .order('run_started_at', { ascending: false })
      .limit(10);

    const aiMetrics = {
      runs_last_hour: aiWorkerHealth?.length || 0,
      total_processed: aiWorkerHealth?.reduce((sum, h) => sum + (h.messages_processed || 0), 0) || 0,
      total_failed: aiWorkerHealth?.reduce((sum, h) => sum + (h.messages_failed || 0), 0) || 0,
      average_latency_ms: aiWorkerHealth?.length
        ? Math.round(
            aiWorkerHealth
              .filter(h => h.average_latency_ms)
              .reduce((sum, h) => sum + (h.average_latency_ms || 0), 0) /
            aiWorkerHealth.filter(h => h.average_latency_ms).length
          )
        : null,
      current_queue_length: aiWorkerHealth?.[0]?.queue_length || 0,
    };

    // Retry Queue Status
    const { data: retryQueue, error: retryError } = await supabase
      .from('inbound_email_retry_queue')
      .select('*')
      .in('status', ['pending', 'processing']);

    const retryMetrics = {
      pending: retryQueue?.filter(q => q.status === 'pending').length || 0,
      processing: retryQueue?.filter(q => q.status === 'processing').length || 0,
      total: retryQueue?.length || 0,
    };

    // Failed Messages (last 24 hours)
    const { data: failedMessages, error: failedError } = await supabase
      .from('inbound_email_logs')
      .select('*')
      .eq('processed', false)
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    const failedMetrics = {
      total_unprocessed: failedMessages?.length || 0,
      recent_errors: failedMessages?.map(m => ({
        id: m.id,
        provider: m.provider,
        error: m.error_message,
        created_at: m.created_at,
      })) || [],
    };

    // System Health Status
    const healthStatus = {
      webhook_events: webhookError ? 'error' : 'healthy',
      ai_worker: aiError ? 'error' : 'healthy',
      retry_queue: retryError ? 'error' : 'healthy',
      overall: !webhookError && !aiError && !retryError ? 'healthy' : 'degraded',
    };

    return NextResponse.json({
      status: 'ok',
      timestamp: now.toISOString(),
      health: healthStatus,
      metrics: {
        webhook: webhookMetrics,
        ai_worker: aiMetrics,
        retry_queue: retryMetrics,
        failed_messages: failedMetrics,
      },
    });
  } catch (error: any) {
    console.error('Error fetching monitoring data:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}



















































