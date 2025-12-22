import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get total count
    const { count: total } = await supabase
      .from('suppressions')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    // Get count by source
    const { data: sourceStats } = await supabase
      .from('suppressions')
      .select('source')
      .eq('workspace_id', workspaceId);

    const bySource: Record<string, number> = {};
    if (sourceStats) {
      sourceStats.forEach((item: any) => {
        const source = item.source || 'unknown';
        bySource[source] = (bySource[source] || 0) + 1;
      });
    }

    // Get count by kind
    const { data: kindStats } = await supabase
      .from('suppressions')
      .select('kind')
      .eq('workspace_id', workspaceId);

    const byKind: Record<string, number> = {};
    if (kindStats) {
      kindStats.forEach((item: any) => {
        byKind[item.kind] = (byKind[item.kind] || 0) + 1;
      });
    }

    return NextResponse.json({
      success: true,
      stats: {
        total: total || 0,
        bySource,
        byKind,
      },
    });

  } catch (error) {
    console.error('Error fetching suppression stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch suppression stats' },
      { status: 500 }
    );
  }
} 