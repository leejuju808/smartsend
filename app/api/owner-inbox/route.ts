/**
 * Block 24780 — SmartSend Roofing Owner Inbox v2 API
 * Owner-Only View • High-Priority Escalations • Financial Alerts
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(req.url);
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }

    const workspaceId = workspaceMember.workspace_id;

    // Check if user is owner
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      // Check if user has owner role
      const { data: userRole } = await supabase
        .from('users')
        .select('role')
        .eq('auth_user_id', user.id)
        .single();

      if (userRole?.role !== 'owner') {
        return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
      }
    }

    // Parse query parameters
    const status = searchParams.get('status') || 'new';
    const priority = searchParams.get('priority');
    const messageType = searchParams.get('message_type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('owner_inbox_items')
      .select(`
        *,
        related_job:roofing_jobs(id, title, job_value, status),
        related_lead:leads(id, email, first_name, last_name),
        related_crew:crews(id, name),
        related_supplier:suppliers(id, name),
        related_invoice:job_invoices(id, amount, status),
        related_payment:job_payments(id, amount)
      `)
      .eq('workspace_id', workspaceId)
      .eq('owner_id', user.id)
      .eq('status', status)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (messageType) {
      query = query.eq('message_type', messageType);
    }

    const { data: items, error } = await query;

    if (error) {
      console.error('Error fetching owner inbox items:', error);
      return NextResponse.json({ error: 'Failed to fetch inbox items' }, { status: 500 });
    }

    // Get counts by priority
    const { data: counts } = await supabase
      .from('owner_inbox_items')
      .select('priority', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .eq('owner_id', user.id)
      .eq('status', 'new');

    const priorityCounts = {
      critical: counts?.filter(c => c.priority === 'critical').length || 0,
      high: counts?.filter(c => c.priority === 'high').length || 0,
      medium: counts?.filter(c => c.priority === 'medium').length || 0,
      low: counts?.filter(c => c.priority === 'low').length || 0,
    };

    return NextResponse.json({
      items: items || [],
      counts: {
        total: items?.length || 0,
        by_priority: priorityCounts,
      },
    });
  } catch (error) {
    console.error('Owner inbox API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { itemId, action, ...updates } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    // Verify user owns this item
    const { data: item } = await supabase
      .from('owner_inbox_items')
      .select('owner_id')
      .eq('id', itemId)
      .single();

    if (!item || item.owner_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Handle actions
    let updateData: any = { ...updates, updated_at: new Date().toISOString() };

    if (action === 'resolve') {
      updateData.status = 'resolved';
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = user.id;
    } else if (action === 'dismiss') {
      updateData.status = 'dismissed';
      updateData.dismissed_at = new Date().toISOString();
      updateData.dismissed_by = user.id;
    } else if (action === 'acknowledge') {
      updateData.status = 'acknowledged';
    }

    const { data, error } = await supabase
      .from('owner_inbox_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      console.error('Error updating owner inbox item:', error);
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error('Owner inbox update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}






































