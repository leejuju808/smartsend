/**
 * Block 23610 — Churn Signal Detection API
 * Endpoint to detect and create churn signals for a workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectChurnSignals, createChurnSignal, getDaysSinceSignup } from '@/lib/churn-prevention/monitoring-service';
import {
  sendEasyWinIntervention,
  sendLowReplyIntervention,
  sendDashboardGhostIntervention
} from '@/lib/churn-prevention/intervention-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json();
    
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }
    
    // Get workspace owner
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single();
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    const userId = workspace.owner_id;
    const daysSinceSignup = await getDaysSinceSignup(workspaceId);
    
    // Only detect signals for week 1-2 (days 1-14)
    if (daysSinceSignup > 14) {
      return NextResponse.json({
        signals: [],
        message: 'Outside early detection window (days 1-14)'
      });
    }
    
    // Detect signals
    const signals = await detectChurnSignals(workspaceId);
    
    // Create churn signal records and trigger interventions
    const createdSignals = [];
    for (const signal of signals) {
      // Create signal record
      await createChurnSignal(
        workspaceId,
        userId,
        signal.signal_type,
        signal.severity,
        signal.metadata
      );
      
      // Trigger appropriate intervention
      let interventionId: string | undefined;
      
      switch (signal.signal_type) {
        case 'zero_campaigns_7d':
          if (daysSinceSignup >= 7) {
            interventionId = await sendEasyWinIntervention(workspaceId, userId);
          }
          break;
        case 'zero_replies_3d':
        case 'zero_replies_5d':
          interventionId = await sendLowReplyIntervention(workspaceId, userId);
          break;
        case 'no_dashboard_visit':
          interventionId = await sendDashboardGhostIntervention(workspaceId, userId);
          break;
      }
      
      createdSignals.push({
        ...signal,
        intervention_sent: !!interventionId
      });
    }
    
    return NextResponse.json({
      signals: createdSignals,
      days_since_signup: daysSinceSignup
    });
  } catch (error: any) {
    console.error('Error detecting churn signals:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect churn signals' },
      { status: 500 }
    );
  }
}






































