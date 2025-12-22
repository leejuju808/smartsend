/**
 * API Route: Get Smart Send Recommendations
 * GET /api/smart-send/recommendations?workspaceId=xxx&zipcode=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
  getBestSendTimes,
  getZipcodeHotspots,
  getRecommendedSendRate,
} from '@/lib/smart-send/algorithm';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');
    const zipcode = searchParams.get('zipcode');
    const minHour = parseInt(searchParams.get('minHour') || '9');
    const maxHour = parseInt(searchParams.get('maxHour') || '17');
    const daysOfWeek = searchParams
      .get('daysOfWeek')
      ?.split(',')
      .map((d) => parseInt(d))
      .filter((d) => !isNaN(d));

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get recommendations
    const recommendations = await getBestSendTimes({
      workspaceId,
      zipcode: zipcode || undefined,
      minHour,
      maxHour,
      daysOfWeek: daysOfWeek || [1, 2, 3, 4, 5],
    });

    // Get ZIP hotspots
    const hotspots = await getZipcodeHotspots(workspaceId, 10);

    // Get recommended send rate
    const sendRate = await getRecommendedSendRate(workspaceId);

    return NextResponse.json({
      recommendations,
      hotspots,
      recommendedSendRate: sendRate,
    });
  } catch (error: any) {
    console.error('Recommendations error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}



























