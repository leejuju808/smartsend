/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * Cron job for automatic scheduling intelligence:
 * - Weather risk checks
 * - Conflict detection
 * - Capacity forecasting
 * - Auto-rescheduling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkWeatherRisk, detectConflicts, calculateCapacityForecast, autoRescheduleEvent } from '@/lib/scheduling-intelligence';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/cron/scheduling-intelligence
 * Run scheduling intelligence checks (called by cron)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const today = new Date();
    const next14Days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Get all active workspaces
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .eq('is_active', true);

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ message: 'No active workspaces' });
    }

    const results = {
      workspacesProcessed: 0,
      weatherChecks: 0,
      conflictsDetected: 0,
      eventsRescheduled: 0,
      capacityForecastsUpdated: 0,
      errors: [] as string[],
    };

    for (const workspace of workspaces) {
      try {
        // 1. Get upcoming scheduled events
        const { data: events } = await supabase
          .from('calendar_events')
          .select('id, job_id, start_time, weather_risk_score, event_status')
          .eq('workspace_id', workspace.id)
          .in('event_status', ['scheduled', 'rescheduled'])
          .gte('start_time', today.toISOString())
          .lte('start_time', next14Days.toISOString())
          .in('event_type', ['install', 'repair']);

        // 2. Check weather for each event
        for (const event of events || []) {
          try {
            if (!event.job_id) continue;

            const weatherRisk = await checkWeatherRisk(
              event.job_id,
              event.start_time,
              undefined
            );

            results.weatherChecks++;

            // Update weather risk score
            await supabase
              .from('calendar_events')
              .update({
                weather_risk_score: weatherRisk.score,
                updated_at: new Date().toISOString(),
              })
              .eq('id', event.id);

            // Auto-reschedule if critical weather risk
            if (weatherRisk.riskLevel === 'critical' && weatherRisk.alternativeDate) {
              const newStartTime = new Date(weatherRisk.alternativeDate);
              newStartTime.setHours(8, 0, 0, 0); // Default to 8 AM

              const rescheduleResult = await autoRescheduleEvent(workspace.id, {
                eventId: event.id,
                reason: `Weather risk: ${weatherRisk.threats.join(', ')}`,
                newStartTime: newStartTime.toISOString(),
                notifyCustomer: true,
                updateMaterials: true,
              });

              if (rescheduleResult.success) {
                results.eventsRescheduled++;
              }
            }
          } catch (error) {
            results.errors.push(`Weather check error for event ${event.id}: ${error}`);
          }
        }

        // 3. Detect conflicts
        try {
          const conflicts = await detectConflicts(
            workspace.id,
            today.toISOString().split('T')[0],
            next14Days.toISOString().split('T')[0]
          );

          results.conflictsDetected += conflicts.length;

          // Store conflicts in database
          for (const conflict of conflicts) {
            await supabase
              .from('schedule_conflicts')
              .upsert({
                workspace_id: workspace.id,
                event_id: conflict.eventId,
                conflicting_event_id: conflict.conflictingEventId,
                conflict_type: conflict.conflictType,
                severity: conflict.severity,
                description: conflict.description,
                resolution_suggestion: conflict.resolutionSuggestion,
                resolved: false,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'event_id,conflict_type',
              });
          }
        } catch (error) {
          results.errors.push(`Conflict detection error: ${error}`);
        }

        // 4. Calculate capacity forecast
        try {
          await calculateCapacityForecast(
            workspace.id,
            today.toISOString().split('T')[0],
            next14Days.toISOString().split('T')[0]
          );
          results.capacityForecastsUpdated++;
        } catch (error) {
          results.errors.push(`Capacity forecast error: ${error}`);
        }

        results.workspacesProcessed++;
      } catch (error) {
        results.errors.push(`Workspace ${workspace.id} error: ${error}`);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Scheduling intelligence cron error:', error);
    return NextResponse.json(
      { error: 'Failed to run scheduling intelligence', details: String(error) },
      { status: 500 }
    );
  }
}





















