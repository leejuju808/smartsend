/**
 * Block 255000 — Crew Routes API
 * GET /api/storm/[stormId]/routes - Get crew routes
 * POST /api/storm/[stormId]/routes - Generate crew routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCrewRoutes, getCrewRoutes } from '@/lib/storm/crew-routing';

export async function GET(
  req: NextRequest,
  { params }: { params: { stormId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    const routes = await getCrewRoutes(params.stormId, teamId);

    return NextResponse.json({ routes });
  } catch (error: any) {
    console.error('Error fetching crew routes:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { stormId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { teamId, crews } = body;

    if (!teamId || !crews || !Array.isArray(crews)) {
      return NextResponse.json(
        { error: 'teamId and crews array are required' },
        { status: 400 }
      );
    }

    const result = await generateCrewRoutes(params.stormId, teamId, crews);

    return NextResponse.json({
      routes: result.routes,
      errors: result.errors,
      total: result.routes.length
    });
  } catch (error: any) {
    console.error('Error generating crew routes:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






















