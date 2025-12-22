/**
 * Block 256500 — AI Project Manager Assistant v1
 * GET /api/pm-assistant/crew-communications - Get crew communications for PM
 * POST /api/pm-assistant/crew-communications - Create a new crew communication
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
    const job_id = searchParams.get('job_id');
    const crew_id = searchParams.get('crew_id');
    const status = searchParams.get('status') || 'new';
    const communication_type = searchParams.get('communication_type');

    if (!pm_id && !job_id && !crew_id) {
      return NextResponse.json(
        { error: 'pm_id, job_id, or crew_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('crew_pm_communications')
      .select(`
        *,
        jobs:job_id (id, address, homeowner_name),
        crews:crew_id (id, name)
      `)
      .order('created_at', { ascending: false });

    if (pm_id) {
      query = query.eq('pm_id', pm_id);
    }

    if (job_id) {
      query = query.eq('job_id', job_id);
    }

    if (crew_id) {
      query = query.eq('crew_id', crew_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (communication_type) {
      query = query.eq('communication_type', communication_type);
    }

    const { data: communications, error: commError } = await query;

    if (commError) {
      console.error('Error fetching communications:', commError);
      return NextResponse.json(
        { error: commError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      communications: communications || [],
      count: communications?.length || 0,
    });
  } catch (error: any) {
    console.error('Error in crew communications API:', error);
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
    const { job_id, crew_id, pm_id, communication_type, message, photos, metadata } = body;

    if (!job_id || !communication_type || !message) {
      return NextResponse.json(
        { error: 'job_id, communication_type, and message are required' },
        { status: 400 }
      );
    }

    // Create communication
    const { data: newComm, error: createError } = await supabase
      .from('crew_pm_communications')
      .insert({
        job_id,
        crew_id: crew_id || null,
        pm_id: pm_id || null,
        communication_type,
        message,
        photos: photos || [],
        metadata: metadata || {},
        status: 'new',
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating communication:', createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      communication: newComm,
    });
  } catch (error: any) {
    console.error('Error in crew communication creation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















