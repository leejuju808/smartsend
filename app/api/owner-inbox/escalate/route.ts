/**
 * Block 24780 — SmartSend Roofing Owner Inbox Escalation API
 * Triggers escalation engine to check for new items
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();

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
      const { data: userRole } = await supabase
        .from('users')
        .select('role')
        .eq('auth_user_id', user.id)
        .single();

      if (userRole?.role !== 'owner') {
        return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
      }
    }

    const { workspace_id: targetWorkspaceId } = body;

    // Run escalation engine
    const { error } = await supabase.rpc('run_owner_inbox_escalation_engine', {
      p_workspace_id: targetWorkspaceId || workspaceId,
    });

    if (error) {
      console.error('Error running escalation engine:', error);
      return NextResponse.json({ error: 'Failed to run escalation engine' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Escalation engine ran successfully' });
  } catch (error) {
    console.error('Owner inbox escalation API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}






































