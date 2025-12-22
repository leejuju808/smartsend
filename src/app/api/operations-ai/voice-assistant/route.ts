// Block 254100 — Operations AI Director: Voice Assistant (Operations Copilot)
// POST /api/operations-ai/voice-assistant

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { OperationsAIDirector } from '@/lib/ai/operations-director';

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { query, workspaceId } = body;

    if (!query || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing required fields: query, workspaceId' },
        { status: 400 }
      );
    }

    // Get context for the query
    // Get active jobs
    const { data: jobs } = await supabase
      .from('roofing_jobs')
      .select('id, title, status, scheduled_start_date')
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'in_progress'])
      .limit(20);

    // Get crews
    const { data: crews } = await supabase
      .from('crews')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .or('is_active.is.null,is_active.eq.true')
      .limit(20);

    // Get efficiency scores for crews
    const crewsWithScores = await Promise.all(
      (crews || []).map(async (crew: any) => {
        const { data: efficiency } = await supabase
          .from('crew_efficiency_scores')
          .select('score')
          .eq('crew_id', crew.id)
          .eq('workspace_id', workspaceId)
          .gte('period_end', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('period_end', { ascending: false })
          .limit(1)
          .single();

        return {
          id: crew.id,
          name: crew.name || 'Unnamed Crew',
          efficiencyScore: efficiency?.score || 50
        };
      })
    );

    // Get recent predictions
    const { data: predictions } = await supabase
      .from('ai_predictions')
      .select('job_id, prediction_type, message')
      .eq('workspace_id', workspaceId)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })
      .limit(10);

    // Answer query using AI
    const answer = await OperationsAIDirector.answerVoiceQuery({
      query,
      context: {
        workspaceId,
        jobs: jobs || [],
        crews: crewsWithScores,
        predictions: predictions || []
      }
    });

    return NextResponse.json({
      answer,
      query
    });
  } catch (error: any) {
    console.error('Error answering voice query:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to answer query' },
      { status: 500 }
    );
  }
}






















