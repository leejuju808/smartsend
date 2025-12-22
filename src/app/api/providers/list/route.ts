import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { ProviderPool } from '@/lib/providerPool';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace ID from query params
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify user is member of workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Get providers for workspace
    const providerPool = new ProviderPool({ workspace_id: workspaceId });
    const providers = await providerPool.getAllProviders();
    
    // Get stats for each provider
    const providersWithStats = await Promise.all(
      providers.map(async (provider) => {
        const stats = await providerPool.getProviderStats(provider.id, 7);
        return {
          ...provider,
          stats
        };
      })
    );

    return NextResponse.json({
      providers: providersWithStats,
      workspace_capacity: await providerPool.getWorkspaceCapacity()
    });

  } catch (error) {
    console.error('Error listing providers:', error);
    return NextResponse.json(
      { error: 'Failed to list providers' },
      { status: 500 }
    );
  }
} 