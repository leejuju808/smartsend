import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST /api/broadcasts/[id]/pause - Pause a sending broadcast
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: broadcast, error: fetchError } = await supabase
      .from('broadcasts')
      .select('status, workspace_id')
      .eq('id', params.id)
      .single();

    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    if (broadcast.status !== 'sending') {
      return NextResponse.json(
        { error: 'Can only pause broadcasts that are currently sending' },
        { status: 400 }
      );
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', broadcast.workspace_id)
      .eq('user_id', user.id)
      .single();

    const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to pause broadcasts' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('broadcasts')
      .update({ status: 'paused' })
      .eq('id', params.id);

    if (error) {
      console.error('Error pausing broadcast:', error);
      return NextResponse.json({ error: 'Failed to pause broadcast' }, { status: 500 });
    }

    // Log activity
    try {
      await supabase.from('workspace_activity_log').insert({
        workspace_id: broadcast.workspace_id,
        user_id: user.id,
        entity_type: 'broadcast',
        entity_id: params.id,
        action: 'pause',
        details: {},
      });
    } catch (e) {
      // Ignore activity log errors
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/broadcasts/[id]/pause:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}



