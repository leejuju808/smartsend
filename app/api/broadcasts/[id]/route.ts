import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/broadcasts/[id] - Get broadcast details
export async function GET(
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

    const { data: broadcast, error } = await supabase
      .from('broadcasts')
      .select(`
        *,
        segments:segment_id(id, name),
        created_by_profile:created_by(id, email, full_name),
        stats:v_broadcast_stats(
          total_recipients,
          sent_count,
          delivered_count,
          opened_count,
          clicked_count,
          replied_count,
          bounced_count,
          spam_count,
          unsubscribe_count,
          delivery_rate,
          open_rate,
          click_rate,
          reply_rate
        )
      `)
      .eq('id', params.id)
      .single();

    if (error || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    return NextResponse.json({ broadcast });
  } catch (error: any) {
    console.error('Error in GET /api/broadcasts/[id]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/broadcasts/[id] - Update broadcast
export async function PUT(
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

    const body = await req.json();
    const updates: any = {};

    // Only allow updates to draft broadcasts
    const { data: existing } = await supabase
      .from('broadcasts')
      .select('status, workspace_id')
      .eq('id', params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only update draft broadcasts' },
        { status: 400 }
      );
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', existing.workspace_id)
      .eq('user_id', user.id)
      .single();

    const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to update broadcasts' },
        { status: 403 }
      );
    }

    // Build updates
    if (body.name !== undefined) updates.name = body.name;
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.body !== undefined) updates.body = body.body;
    if (body.segment_id !== undefined) updates.segment_id = body.segment_id;
    if (body.throttle_per_minute !== undefined) {
      const validThrottles = [15, 30, 60, 120];
      updates.throttle_per_minute = validThrottles.includes(body.throttle_per_minute)
        ? body.throttle_per_minute
        : 30;
    }
    if (body.sender_inbox_ids !== undefined) updates.sender_inbox_ids = body.sender_inbox_ids;
    if (body.rotation_domain_id !== undefined) updates.rotation_domain_id = body.rotation_domain_id;
    if (body.scheduled_at !== undefined) {
      updates.scheduled_at = body.scheduled_at;
      updates.status = body.scheduled_at ? 'scheduled' : 'draft';
    }

    const { data: broadcast, error } = await supabase
      .from('broadcasts')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating broadcast:', error);
      return NextResponse.json({ error: 'Failed to update broadcast' }, { status: 500 });
    }

    return NextResponse.json({ broadcast });
  } catch (error: any) {
    console.error('Error in PUT /api/broadcasts/[id]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/broadcasts/[id] - Delete broadcast
export async function DELETE(
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

    const { data: existing } = await supabase
      .from('broadcasts')
      .select('status, workspace_id')
      .eq('id', params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    // Only allow deletion of draft or completed broadcasts
    if (existing.status === 'sending' || existing.status === 'scheduled') {
      return NextResponse.json(
        { error: 'Cannot delete active broadcasts. Pause or complete first.' },
        { status: 400 }
      );
    }

    // Check permissions (only owner/admin can delete)
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', existing.workspace_id)
      .eq('user_id', user.id)
      .single();

    const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to delete broadcasts' },
        { status: 403 }
      );
    }

    const { error } = await supabase.from('broadcasts').delete().eq('id', params.id);

    if (error) {
      console.error('Error deleting broadcast:', error);
      return NextResponse.json({ error: 'Failed to delete broadcast' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/broadcasts/[id]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}



