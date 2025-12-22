/**
 * Block 24780 — SmartSend Roofing Owner Inbox Daily Digest API
 * Returns digest data for daily email
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

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

    // Get digest data
    const { data: digest, error } = await supabase.rpc('get_owner_inbox_digest', {
      p_workspace_id: workspaceId,
      p_owner_id: user.id,
    });

    if (error) {
      console.error('Error fetching owner inbox digest:', error);
      return NextResponse.json({ error: 'Failed to fetch digest' }, { status: 500 });
    }

    return NextResponse.json({ digest });
  } catch (error) {
    console.error('Owner inbox digest API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}






































