import { NextRequest, NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/userClient';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json();
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    const sb = userClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    // RLS will automatically filter by workspace membership
    const { data: subscribers, error } = await sb
      .from('sequence_subscribers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString())
      .limit(50);

    if (error) throw error;

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ message: 'No subscribers ready to process' });
    }

    // Process subscribers (this would typically involve sending emails)
    // For now, just mark them as processed
    const processedIds = subscribers.map(s => s.id);
    
    await sb
      .from('sequence_subscribers')
      .update({ 
        status: 'processing',
        next_send_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // +24 hours
      })
      .in('id', processedIds);

    return NextResponse.json({ 
      ok: true, 
      processed: processedIds.length,
      message: `Processed ${processedIds.length} subscribers` 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'tick failed' }, { status: 500 });
  }
} 