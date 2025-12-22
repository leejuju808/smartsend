import { NextRequest, NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/userClient';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id');
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
    }

    const sb = userClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    // RLS will automatically filter by workspace membership
    const { data: contacts, error } = await sb
      .from('contacts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ contacts });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'failed to fetch contacts' }, { status: 500 });
  }
} 