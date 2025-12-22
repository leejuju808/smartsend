/**
 * Block 23610 — Dashboard Visit Tracking API
 * Tracks when roofers visit the dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { recordUsage } from '@/lib/churn-prevention/monitoring-service';

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get workspace ID
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .limit(1)
      .single();
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    // Record dashboard visit
    await recordUsage(
      workspace.id,
      user.id,
      'dashboard_visit',
      1
    );
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error tracking dashboard visit:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to track dashboard visit' },
      { status: 500 }
    );
  }
}






































