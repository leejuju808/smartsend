/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for schedule conflict detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectConflicts } from '@/lib/scheduling-intelligence';

/**
 * GET /api/scheduling/conflicts
 * Get schedule conflicts for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id');
    const startDate = searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    const conflicts = await detectConflicts(workspaceId, startDate, endDate);

    // Also fetch stored conflicts from database
    const { data: storedConflicts } = await supabase
      .from('schedule_conflicts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('resolved', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false });

    return NextResponse.json({
      detected: conflicts,
      stored: storedConflicts || [],
    });
  } catch (error) {
    console.error('Error fetching conflicts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conflicts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduling/conflicts
 * Mark a conflict as resolved
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { conflict_id, resolved } = body;

    if (!conflict_id) {
      return NextResponse.json({ error: 'conflict_id required' }, { status: 400 });
    }

    // Get conflict to verify workspace access
    const { data: conflict } = await supabase
      .from('schedule_conflicts')
      .select('workspace_id')
      .eq('id', conflict_id)
      .single();

    if (!conflict) {
      return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', conflict.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    // Update conflict
    const { data: updatedConflict, error: updateError } = await supabase
      .from('schedule_conflicts')
      .update({
        resolved: resolved !== false,
        resolved_at: resolved !== false ? new Date().toISOString() : null,
        resolved_by: resolved !== false ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conflict_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating conflict:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ conflict: updatedConflict });
  } catch (error) {
    console.error('Error updating conflict:', error);
    return NextResponse.json(
      { error: 'Failed to update conflict' },
      { status: 500 }
    );
  }
}





















