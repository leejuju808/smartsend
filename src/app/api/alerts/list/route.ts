import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const { searchParams } = new URL(req.url);

    // Query parameters
    const type = searchParams.get('type');
    const priority = searchParams.get('priority');
    const status = searchParams.get('status') || 'unread';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const contact_id = searchParams.get('contact_id');
    const campaign_id = searchParams.get('campaign_id');

    // Build query
    let query = supabase
      .from('alerts')
      .select(`
        *,
        contact:contacts(id, email, first_name, last_name),
        campaign:campaigns(id, name),
        appointment:schedule_bookings(id, start_time, homeowner_name)
      `)
      .eq('workspace_id', workspaceId)
      .or(`user_id.eq.${user.id},user_id.is.null`) // workspace-wide or user-specific
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (type) {
      query = query.eq('type', type);
    }
    if (priority) {
      query = query.eq('priority', priority);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (contact_id) {
      query = query.eq('contact_id', contact_id);
    }
    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching alerts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch alerts', details: error.message },
        { status: 500 }
      );
    }

    // Get unread count
    const { data: unreadCount } = await supabase.rpc('get_unread_alert_count', {
      p_workspace_id: workspaceId,
      p_user_id: user.id,
    });

    return NextResponse.json({
      alerts: alerts || [],
      unread_count: unreadCount || 0,
      total: alerts?.length || 0,
    });
  } catch (error: any) {
    console.error('Error in GET /api/alerts/list:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































