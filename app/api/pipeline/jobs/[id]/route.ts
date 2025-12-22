/**
 * Block 170000: Pipeline Job API
 * GET /api/pipeline/jobs/[id] - Get job details
 * PATCH /api/pipeline/jobs/[id] - Update job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        *,
        job_stages:stage_id (*),
        crews:crew_id (id, name),
        leads:lead_id (id, first_name, last_name, email, phone, address)
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Error fetching job:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Get activity timeline
    const { data: activity } = await supabase
      .from('job_activity')
      .select('*')
      .eq('job_id', params.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      ok: true,
      job: {
        ...job,
        activity: activity || [],
      },
    });
  } catch (error: any) {
    console.error('Error in job API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      stage_id,
      progress,
      materials,
      production_date,
      notes,
      crew_id,
      homeowner_name,
      homeowner_phone,
      homeowner_email,
      address,
      estimated_value,
      final_value,
      job_type,
      roof_type,
      insurance_claim,
    } = body;

    const updateData: any = {};
    if (stage_id !== undefined) updateData.stage_id = stage_id;
    if (progress !== undefined) updateData.progress = progress;
    if (materials !== undefined) updateData.materials = materials;
    if (production_date !== undefined) updateData.production_date = production_date;
    if (notes !== undefined) updateData.notes = notes;
    if (crew_id !== undefined) updateData.crew_id = crew_id;
    if (homeowner_name !== undefined) updateData.homeowner_name = homeowner_name;
    if (homeowner_phone !== undefined) updateData.homeowner_phone = homeowner_phone;
    if (homeowner_email !== undefined) updateData.homeowner_email = homeowner_email;
    if (address !== undefined) updateData.address = address;
    if (estimated_value !== undefined) updateData.estimated_value = estimated_value;
    if (final_value !== undefined) updateData.final_value = final_value;
    if (job_type !== undefined) updateData.job_type = job_type;
    if (roof_type !== undefined) updateData.roof_type = roof_type;
    if (insurance_claim !== undefined) updateData.insurance_claim = insurance_claim;

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Log manual updates (triggers handle automatic ones)
    if (notes !== undefined && body.log_note) {
      await supabase
        .from('job_activity')
        .insert({
          job_id: params.id,
          user_id: user.id,
          action: 'note_added',
          message: 'Note added',
          metadata: { note: notes },
        });
    }

    return NextResponse.json({
      ok: true,
      job,
    });
  } catch (error: any) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























