import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/broadcasts - List all broadcasts for workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace_id from user
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    let workspaceId = profile?.workspace_id;

    // Fallback: get from workspace_members
    if (!workspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      workspaceId = membership?.workspace_id;
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // Get broadcasts with stats
    const { data: broadcasts, error } = await supabase
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
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching broadcasts:', error);
      return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
    }

    return NextResponse.json({ broadcasts: broadcasts || [] });
  } catch (error: any) {
    console.error('Error in GET /api/broadcasts:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST /api/broadcasts - Create a new broadcast
export async function POST(req: NextRequest) {
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
    const {
      name,
      subject,
      body: bodyText,
      segment_id,
      throttle_per_minute = 30,
      sender_inbox_ids = [],
      rotation_domain_id,
      scheduled_at,
    } = body;

    if (!name || !subject || !bodyText || !segment_id) {
      return NextResponse.json(
        { error: 'Missing required fields: name, subject, body, segment_id' },
        { status: 400 }
      );
    }

    // Validate throttle
    const validThrottles = [15, 30, 60, 120];
    const throttle = validThrottles.includes(throttle_per_minute) ? throttle_per_minute : 30;

    // Get workspace_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    let workspaceId = profile?.workspace_id;

    if (!workspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      workspaceId = membership?.workspace_id;
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // Check permissions
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';
    const membersCanSend = workspace?.settings?.members_can_send_broadcasts === true;

    if (!isOwnerOrAdmin && !membersCanSend) {
      return NextResponse.json(
        { error: 'You do not have permission to create broadcasts' },
        { status: 403 }
      );
    }

    // Create broadcast
    const { data: broadcast, error } = await supabase
      .from('broadcasts')
      .insert({
        workspace_id: workspaceId,
        name,
        subject,
        body: bodyText,
        segment_id,
        created_by: user.id,
        throttle_per_minute: throttle,
        sender_inbox_ids: sender_inbox_ids.length > 0 ? sender_inbox_ids : null,
        rotation_domain_id: rotation_domain_id || null,
        scheduled_at: scheduled_at || null,
        status: scheduled_at ? 'scheduled' : 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating broadcast:', error);
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 });
    }

    // Log activity
    try {
      if (existsTable('workspace_activity_log')) {
        await supabase.from('workspace_activity_log').insert({
          workspace_id: workspaceId,
          user_id: user.id,
          entity_type: 'broadcast',
          entity_id: broadcast.id,
          action: 'create',
          details: { name, segment_id },
        });
      }
    } catch (e) {
      // Ignore activity log errors
    }

    return NextResponse.json({ broadcast }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/broadcasts:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

function existsTable(tableName: string): boolean {
  // Simple check - in production, you'd query information_schema
  return true;
}



