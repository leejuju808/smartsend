/**
 * Block 110000: Crew Assignment API
 * POST /api/team/crews/assign - Assign a job to a crew
 * GET /api/team/crews/assign?crew_id=xxx - Get assignments for a crew
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions/block110000';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const crew_id = searchParams.get('crew_id');
    const company_id = searchParams.get('company_id');
    const job_id = searchParams.get('job_id');

    if (!crew_id && !company_id && !job_id) {
      return NextResponse.json(
        { error: 'crew_id, company_id, or job_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('crew_assignments')
      .select(`
        *,
        crews (
          id,
          name,
          color
        )
      `)
      .order('scheduled_date', { ascending: true });

    if (crew_id) {
      query = query.eq('crew_id', crew_id);
    }

    if (job_id) {
      // Try both roofing_job_id and job_id columns
      query = query.or(`roofing_job_id.eq.${job_id},job_id.eq.${job_id}`);
    }

    if (company_id) {
      // Get crews for company first
      const { data: crews } = await supabase
        .from('crews')
        .select('id')
        .eq('roofing_company_id', company_id);

      if (crews && crews.length > 0) {
        const crewIds = crews.map((c) => c.id);
        query = query.in('crew_id', crewIds);
      } else {
        return NextResponse.json({ ok: true, assignments: [] });
      }
    }

    const { data: assignments, error } = await query;

    if (error) {
      console.error('Error fetching assignments:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      assignments: assignments || [],
    });
  } catch (error: any) {
    console.error('Error in crew assignments API:', error);
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
    const {
      crew_id,
      job_id,
      roofing_job_id,
      scheduled_date,
      scheduled_start_time,
      scheduled_end_time,
      notes,
    } = body;

    if (!crew_id || (!job_id && !roofing_job_id)) {
      return NextResponse.json(
        { error: 'crew_id and job_id (or roofing_job_id) are required' },
        { status: 400 }
      );
    }

    // Get crew to find company_id
    const { data: crew, error: crewError } = await supabase
      .from('crews')
      .select('roofing_company_id')
      .eq('id', crew_id)
      .single();

    if (crewError || !crew) {
      return NextResponse.json(
        { error: 'Crew not found' },
        { status: 404 }
      );
    }

    if (!crew.roofing_company_id) {
      return NextResponse.json(
        { error: 'Crew is not associated with a company' },
        { status: 400 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(
      crew.roofing_company_id,
      user.id,
      'can_assign_jobs'
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to assign jobs to crews' },
        { status: 403 }
      );
    }

    // Create assignment
    const assignmentData: any = {
      crew_id,
      scheduled_date: scheduled_date || null,
      scheduled_start_time: scheduled_start_time || null,
      scheduled_end_time: scheduled_end_time || null,
      notes: notes || null,
      assigned_by: user.id,
      status: 'scheduled',
    };

    // Add job reference (try roofing_job_id first, then job_id)
    if (roofing_job_id) {
      assignmentData.roofing_job_id = roofing_job_id;
    } else if (job_id) {
      assignmentData.job_id = job_id;
    }

    const { data: assignment, error: assignError } = await supabase
      .from('crew_assignments')
      .insert(assignmentData)
      .select()
      .single();

    if (assignError) {
      console.error('Error creating assignment:', assignError);
      return NextResponse.json(
        { error: assignError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from('team_activity')
      .insert({
        user_id: user.id,
        roofing_company_id: crew.roofing_company_id,
        action: 'assigned_job_to_crew',
        entity_type: 'crew_assignment',
        entity_id: assignment.id,
        metadata: {
          crew_id,
          job_id: roofing_job_id || job_id,
          scheduled_date,
        },
      });

    return NextResponse.json({
      ok: true,
      assignment,
    });
  } catch (error: any) {
    console.error('Error assigning job to crew:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























