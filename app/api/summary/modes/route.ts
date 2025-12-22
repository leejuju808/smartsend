// Block 19100 — SmartSend Smart Summary v1
// GET /api/summary/modes - Get available summary modes for workspace

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentWorkspaceId } from '@/src/lib/workspace';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // Get summary modes for workspace
    const { data: modes, error } = await supabase
      .from('summary_modes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('mode_key', { ascending: true });

    if (error) {
      console.error('Error fetching summary modes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ modes: modes || [] });
  } catch (error: any) {
    console.error('Error in GET /api/summary/modes:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































