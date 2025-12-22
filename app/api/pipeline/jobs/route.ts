/**
 * Block 170000: Pipeline Jobs API
 * GET /api/pipeline/jobs - Get jobs for a company/stage
 * POST /api/pipeline/jobs - Create a new job
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
    const company_id = searchParams.get('company_id');
    const stage_id = searchParams.get('stage_id');

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    if (stage_id) {
      // Get jobs for a specific stage
      const { data: jobs, error } = await supabase.rpc('get_jobs_by_stage_id', {
        p_company_id: company_id,
        p_stage_id: stage_id
      });

      if (error) {
        console.error('Error fetching jobs:', error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        jobs: jobs || [],
      });
    } else {
      // Get all jobs for the company
      const { data: jobs, error } = await supabase
        .from('jobs')
        .select(`
          *,
          job_stages:stage_id (*),
          crews:crew_id (id, name),
          leads:lead_id (id, first_name, last_name, email, phone, address)
        `)
        .eq('company_id', company_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching jobs:', error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        jobs: jobs || [],
      });
    }
  } catch (error: any) {
    console.error('Error in jobs API:', error);
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
    const { company_id, lead_id, stage_id, homeowner_name, address, estimated_value } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        company_id,
        lead_id: lead_id || null,
        stage_id: stage_id || null,
        homeowner_name: homeowner_name || null,
        address: address || null,
        estimated_value: estimated_value || null,
        progress: 0,
        materials: '[]'::jsonb,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from('job_activity')
      .insert({
        job_id: job.id,
        user_id: user.id,
        action: 'job_created',
        message: 'Job created',
        metadata: {},
      });

    return NextResponse.json({
      ok: true,
      job,
    });
  } catch (error: any) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























