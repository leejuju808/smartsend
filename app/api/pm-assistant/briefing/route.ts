/**
 * Block 256500 — AI Project Manager Assistant v1
 * GET /api/pm-assistant/briefing - Get or generate daily PM briefing
 * POST /api/pm-assistant/briefing - Manually trigger briefing generation
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
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!pm_id) {
      return NextResponse.json(
        { error: 'pm_id is required' },
        { status: 400 }
      );
    }

    // Get briefing
    const { data: briefing, error: briefingError } = await supabase
      .from('pm_daily_briefings')
      .select('*')
      .eq('pm_id', pm_id)
      .eq('briefing_date', date)
      .single();

    if (briefingError && briefingError.code === 'PGRST116') {
      // Briefing doesn't exist, generate it
      const { data: newBriefingId, error: generateError } = await supabase.rpc(
        'generate_pm_daily_briefing',
        { p_pm_id: pm_id, p_date: date }
      );

      if (generateError) {
        console.error('Error generating briefing:', generateError);
        return NextResponse.json(
          { error: generateError.message },
          { status: 500 }
        );
      }

      // Fetch the generated briefing
      const { data: generatedBriefing, error: fetchError } = await supabase
        .from('pm_daily_briefings')
        .select('*')
        .eq('id', newBriefingId)
        .single();

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        briefing: generatedBriefing,
      });
    }

    if (briefingError) {
      return NextResponse.json(
        { error: briefingError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      briefing: briefing,
    });
  } catch (error: any) {
    console.error('Error in briefing API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pm_id, date } = body;

    if (!pm_id) {
      return NextResponse.json(
        { error: 'pm_id is required' },
        { status: 400 }
      );
    }

    const briefingDate = date || new Date().toISOString().split('T')[0];

    // Generate briefing
    const { data: briefingId, error: generateError } = await supabase.rpc(
      'generate_pm_daily_briefing',
      { p_pm_id: pm_id, p_date: briefingDate }
    );

    if (generateError) {
      console.error('Error generating briefing:', generateError);
      return NextResponse.json(
        { error: generateError.message },
        { status: 500 }
      );
    }

    // Fetch the generated briefing
    const { data: briefing, error: fetchError } = await supabase
      .from('pm_daily_briefings')
      .select('*')
      .eq('id', briefingId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      briefing: briefing,
    });
  } catch (error: any) {
    console.error('Error in briefing generation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















