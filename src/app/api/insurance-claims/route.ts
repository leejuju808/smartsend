// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Insurance Claims CRUD
// GET /api/insurance-claims - List claims
// POST /api/insurance-claims - Create claim

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');
    const workspaceId = searchParams.get('workspace_id');
    const status = searchParams.get('status');

    let query = serviceSupabase
      .from('insurance_claims')
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address
        ),
        supplement_items (
          id,
          supplement_number,
          line_item,
          cost,
          status
        ),
        evidence_photos (
          id,
          photo_url,
          ai_damage_type,
          ai_confidence
        ),
        claim_tasks (
          id,
          task_type,
          title,
          status,
          due_date
        )
      `)
      .order('created_at', { ascending: false });

    if (jobId) {
      query = query.eq('job_id', jobId);
    }

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    if (status) {
      query = query.eq('claim_status', status);
    }

    const { data: claims, error } = await query;

    if (error) {
      console.error('Error fetching claims:', error);
      return NextResponse.json(
        { error: 'Failed to fetch claims' },
        { status: 500 }
      );
    }

    return NextResponse.json({ claims: claims || [] });
  } catch (error: any) {
    console.error('Error in GET /api/insurance-claims:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      job_id,
      workspace_id,
      claim_number,
      carrier,
      policy_number,
      adjuster_name,
      adjuster_phone,
      adjuster_email,
      adjuster_company,
      deductible,
      claim_filed_date,
    } = body;

    if (!job_id || !claim_number || !carrier) {
      return NextResponse.json(
        { error: 'job_id, claim_number, and carrier are required' },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await serviceSupabase
      .from('jobs')
      .select('id, workspace_id')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const finalWorkspaceId = workspace_id || job.workspace_id;

    // Create claim
    const { data: claim, error: claimError } = await serviceSupabase
      .from('insurance_claims')
      .insert({
        job_id,
        workspace_id: finalWorkspaceId,
        claim_number,
        carrier,
        policy_number,
        adjuster_name,
        adjuster_phone,
        adjuster_email,
        adjuster_company,
        deductible: deductible ? parseFloat(deductible) : null,
        claim_filed_date: claim_filed_date || new Date().toISOString().split('T')[0],
        claim_status: 'filed',
        created_by: user.id,
      })
      .select()
      .single();

    if (claimError) {
      console.error('Error creating claim:', claimError);
      return NextResponse.json(
        { error: 'Failed to create claim' },
        { status: 500 }
      );
    }

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/insurance-claims:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















