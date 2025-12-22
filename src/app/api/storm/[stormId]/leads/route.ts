/**
 * Block 255000 — Storm Leads API
 * GET /api/storm/[stormId]/leads - Get storm leads
 * POST /api/storm/[stormId]/leads - Generate storm leads
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateStormLeads } from '@/lib/storm/lead-generator';

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
    const source = searchParams.get('source');
    const status = searchParams.get('status');

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    let query = supabase
      .from('storm_leads')
      .select('*')
      .eq('storm_id', params.stormId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (source) {
      query = query.eq('source', source);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: leads, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [] });
  } catch (error: any) {
    console.error('Error fetching storm leads:', error);
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
    const { teamId, zips } = body;

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    // Fetch storm to get affected zips if not provided
    let affectedZips = zips;
    if (!affectedZips) {
      const { data: storm } = await supabase
        .from('storm_events')
        .select('affected_zips')
        .eq('id', params.stormId)
        .single();

      if (storm?.affected_zips) {
        affectedZips = storm.affected_zips;
      } else {
        return NextResponse.json(
          { error: 'No affected ZIPs found. Provide zips parameter or ensure storm has affected_zips.' },
          { status: 400 }
        );
      }
    }

    // Generate leads
    const result = await generateStormLeads(params.stormId, teamId, affectedZips);

    return NextResponse.json({
      created: result.created,
      errors: result.errors,
      total: result.created + result.errors
    });
  } catch (error: any) {
    console.error('Error generating storm leads:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






















