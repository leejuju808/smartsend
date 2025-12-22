// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Single Insurance Claim
// GET /api/insurance-claims/[id] - Get claim
// PATCH /api/insurance-claims/[id] - Update claim
// DELETE /api/insurance-claims/[id] - Delete claim

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { data: claim, error } = await serviceSupabase
      .from('insurance_claims')
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address,
          estimated_value,
          final_value
        ),
        supplement_items (
          id,
          supplement_number,
          line_item,
          cost,
          quantity,
          unit,
          reason,
          reason_type,
          status,
          submitted_at,
          approved_at,
          denied_at
        ),
        evidence_photos (
          id,
          photo_url,
          thumbnail_url,
          ai_damage_type,
          ai_damage_types,
          ai_confidence,
          ai_findings,
          ai_location,
          ai_severity,
          photo_category,
          taken_at
        ),
        claim_tasks (
          id,
          task_type,
          title,
          description,
          status,
          assigned_to,
          assigned_to_name,
          due_date,
          completed_at,
          priority
        )
      `)
      .eq('id', id)
      .single();

    if (error || !claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ claim });
  } catch (error: any) {
    console.error('Error in GET /api/insurance-claims/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();

    // Remove fields that shouldn't be updated directly
    const {
      id: _id,
      created_at,
      created_by,
      ...updateData
    } = body;

    const { data: claim, error } = await serviceSupabase
      .from('insurance_claims')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating claim:', error);
      return NextResponse.json(
        { error: 'Failed to update claim' },
        { status: 500 }
      );
    }

    return NextResponse.json({ claim });
  } catch (error: any) {
    console.error('Error in PATCH /api/insurance-claims/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { error } = await serviceSupabase
      .from('insurance_claims')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting claim:', error);
      return NextResponse.json(
        { error: 'Failed to delete claim' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/insurance-claims/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















