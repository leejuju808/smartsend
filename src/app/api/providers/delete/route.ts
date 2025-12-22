import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { provider_id, workspace_id } = body;

    if (!provider_id || !workspace_id) {
      return NextResponse.json(
        { error: 'Provider ID and workspace ID required' },
        { status: 400 }
      );
    }

    // Verify user is member of workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Check if provider exists and belongs to workspace
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('id, name')
      .eq('id', provider_id)
      .eq('workspace_id', workspace_id)
      .single();

    if (providerError || !provider) {
      return NextResponse.json(
        { error: 'Provider not found or access denied' },
        { status: 404 }
      );
    }

    // Delete provider (this will cascade to provider_counters)
    const { error: deleteError } = await supabase
      .from('providers')
      .delete()
      .eq('id', provider_id)
      .eq('workspace_id', workspace_id); // Security: ensure provider belongs to workspace

    if (deleteError) {
      console.error('Error deleting provider:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete provider' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Provider "${provider.name}" deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting provider:', error);
    return NextResponse.json(
      { error: 'Failed to delete provider' },
      { status: 500 }
    );
  }
} 