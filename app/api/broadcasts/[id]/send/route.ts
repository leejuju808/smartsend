import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST /api/broadcasts/[id]/send - Send or schedule a broadcast
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

    const body = await req.json();
    const { scheduled_at } = body;

    // Get broadcast
    const { data: broadcast, error: fetchError } = await supabase
      .from('broadcasts')
      .select('*, workspace_id')
      .eq('id', params.id)
      .single();

    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', broadcast.workspace_id)
      .eq('user_id', user.id)
      .single();

    const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', broadcast.workspace_id)
      .single();

    const membersCanSend = workspace?.settings?.members_can_send_broadcasts === true;

    if (!isOwnerOrAdmin && !membersCanSend) {
      return NextResponse.json(
        { error: 'You do not have permission to send broadcasts' },
        { status: 403 }
      );
    }

    // Prepare broadcast for sending
    const { data: prepareResult, error: prepareError } = await supabase.rpc(
      'prepare_broadcast_send',
      {
        p_broadcast_id: params.id,
      }
    );

    if (prepareError) {
      console.error('Error preparing broadcast:', prepareError);
      return NextResponse.json(
        { error: prepareError.message || 'Failed to prepare broadcast' },
        { status: 500 }
      );
    }

    if (prepareResult?.error) {
      return NextResponse.json({ error: prepareResult.error }, { status: 400 });
    }

    // Update broadcast status
    const status = scheduled_at ? 'scheduled' : 'sending';
    const { error: updateError } = await supabase
      .from('broadcasts')
      .update({
        status,
        scheduled_at: scheduled_at || null,
        started_at: scheduled_at ? null : new Date().toISOString(),
      })
      .eq('id', params.id);

    if (updateError) {
      console.error('Error updating broadcast status:', updateError);
      return NextResponse.json({ error: 'Failed to update broadcast status' }, { status: 500 });
    }

    // Queue emails if sending now
    if (!scheduled_at) {
      const { error: queueError } = await supabase.rpc('queue_broadcast_emails', {
        p_broadcast_id: params.id,
        p_batch_size: 100,
      });

      if (queueError) {
        console.error('Error queueing broadcast emails:', queueError);
        // Don't fail the request, emails will be queued by cron
      }
    }

    // Log activity
    try {
      await supabase.from('workspace_activity_log').insert({
        workspace_id: broadcast.workspace_id,
        user_id: user.id,
        entity_type: 'broadcast',
        entity_id: params.id,
        action: scheduled_at ? 'schedule' : 'send',
        details: {
          scheduled_at: scheduled_at || null,
          recipients: prepareResult?.recipients_created || 0,
        },
      });
    } catch (e) {
      // Ignore activity log errors
    }

    return NextResponse.json({
      success: true,
      broadcast_id: params.id,
      recipients_created: prepareResult?.recipients_created || 0,
      status,
    });
  } catch (error: any) {
    console.error('Error in POST /api/broadcasts/[id]/send:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}



