import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all creators with user info
    const { data: creators, error } = await supabase
      .from('marketplace_creators')
      .select(`
        *,
        user:auth.users(email, created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ creators: creators || [] });

  } catch (error) {
    console.error('Admin creators list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch creators' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { creatorId, action } = await req.json();

    if (!creatorId || !action) {
      return NextResponse.json({ error: 'Creator ID and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject', 'disable'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update creator status
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'disabled';
    
    const { error: updateError } = await supabase
      .from('marketplace_creators')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', creatorId);

    if (updateError) throw updateError;

    // Emit analytics event
    console.log('creator_approved', { adminId: user.id, creatorId, action, status });

    return NextResponse.json({ success: true, status });

  } catch (error) {
    console.error('Admin creator action error:', error);
    return NextResponse.json(
      { error: 'Failed to update creator status' },
      { status: 500 }
    );
  }
} 