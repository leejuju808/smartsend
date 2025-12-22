/**
 * Block 23610 — Churn Prevention Cron Job
 * Runs daily to detect signals, send check-ins, and execute retention plays
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectChurnSignals, createChurnSignal, getDaysSinceSignup } from '@/lib/churn-prevention/monitoring-service';
import {
  sendEasyWinIntervention,
  sendLowReplyIntervention,
  sendDashboardGhostIntervention
} from '@/lib/churn-prevention/intervention-service';
import { sendMonthlyCheckIn, getWorkspacesNeedingCheckIn } from '@/lib/churn-prevention/monthly-checkin';
import { sendWinBackAttempt, getCancelledWorkspacesNeedingWinBack } from '@/lib/churn-prevention/winback-service';
import { execute90DayRetentionPlay, getWorkspacesNeeding90DayRetention } from '@/lib/churn-prevention/retention-play';
import { launchNextCampaignIfDue } from '@/lib/churn-prevention/campaign-ladder';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify cron secret
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const results = {
      churn_signals_detected: 0,
      interventions_sent: 0,
      monthly_checkins_sent: 0,
      winback_attempts_sent: 0,
      retention_plays_executed: 0,
      campaigns_launched: 0
    };
    
    // 1. Detect churn signals for all workspaces in week 1-2
    const { data: newWorkspaces } = await supabase
      .from('workspaces')
      .select('id, owner_id, created_at')
      .is('deleted_at', null)
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .lt('created_at', new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString());
    
    if (newWorkspaces) {
      for (const workspace of newWorkspaces) {
        const daysSinceSignup = await getDaysSinceSignup(workspace.id);
        
        if (daysSinceSignup <= 14) {
          const signals = await detectChurnSignals(workspace.id);
          
          for (const signal of signals) {
            await createChurnSignal(
              workspace.id,
              workspace.owner_id,
              signal.signal_type,
              signal.severity,
              signal.metadata
            );
            results.churn_signals_detected++;
            
            // Trigger intervention
            let interventionId: string | undefined;
            switch (signal.signal_type) {
              case 'zero_campaigns_7d':
                if (daysSinceSignup >= 7) {
                  interventionId = await sendEasyWinIntervention(workspace.id, workspace.owner_id);
                }
                break;
              case 'zero_replies_3d':
              case 'zero_replies_5d':
                interventionId = await sendLowReplyIntervention(workspace.id, workspace.owner_id);
                break;
              case 'no_dashboard_visit':
                interventionId = await sendDashboardGhostIntervention(workspace.id, workspace.owner_id);
                break;
            }
            
            if (interventionId) {
              results.interventions_sent++;
            }
          }
        }
      }
    }
    
    // 2. Send monthly check-ins
    const workspacesNeedingCheckIn = await getWorkspacesNeedingCheckIn();
    for (const ws of workspacesNeedingCheckIn) {
      try {
        await sendMonthlyCheckIn(ws.workspace_id, ws.user_id);
        results.monthly_checkins_sent++;
      } catch (error) {
        console.error(`Error sending check-in to ${ws.workspace_id}:`, error);
      }
    }
    
    // 3. Send win-back attempts
    const cancelledWorkspaces = await getCancelledWorkspacesNeedingWinBack();
    for (const ws of cancelledWorkspaces) {
      try {
        const attemptId = await sendWinBackAttempt(ws.workspace_id, ws.user_id);
        if (attemptId) {
          results.winback_attempts_sent++;
        }
      } catch (error) {
        console.error(`Error sending win-back to ${ws.workspace_id}:`, error);
      }
    }
    
    // 4. Execute 90-day retention plays
    const workspacesNeedingRetention = await getWorkspacesNeeding90DayRetention();
    for (const ws of workspacesNeedingRetention) {
      try {
        const success = await execute90DayRetentionPlay(ws.workspace_id, ws.user_id);
        if (success) {
          results.retention_plays_executed++;
        }
      } catch (error) {
        console.error(`Error executing retention play for ${ws.workspace_id}:`, error);
      }
    }
    
    // 5. Launch campaign ladder campaigns (if due)
    const { data: allWorkspaces } = await supabase
      .from('workspaces')
      .select('id, owner_id')
      .is('deleted_at', null);
    
    if (allWorkspaces) {
      for (const workspace of allWorkspaces) {
        try {
          const launched = await launchNextCampaignIfDue(workspace.id, workspace.owner_id);
          if (launched) {
            results.campaigns_launched++;
          }
        } catch (error) {
          console.error(`Error launching campaign for ${workspace.id}:`, error);
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error in churn prevention cron:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run churn prevention cron' },
      { status: 500 }
    );
  }
}






































