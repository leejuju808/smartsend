import { NextRequest, NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/userClient';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    const sb = userClient();
    
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    
    // Find invitation
    const { data: inv } = await sb
      .from('workspace_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle();
      
    if (!inv) {
      return NextResponse.json({ error: 'invalid token' }, { status: 404 });
    }
    
    if (inv.redeemed_at) {
      return NextResponse.json({ error: 'already used' }, { status: 400 });
    }

    // Add user to workspace
    const { error: memberError } = await sb
      .from('workspace_members')
      .upsert({ 
        workspace_id: inv.workspace_id, 
        user_id: user.id, 
        role: inv.role 
      });
      
    if (memberError) throw memberError;
    
    // Mark invitation as redeemed
    const { error: updateError } = await sb
      .from('workspace_invites')
      .update({ 
        redeemed_by: user.id, 
        redeemed_at: new Date().toISOString() 
      })
      .eq('id', inv.id);
      
    if (updateError) throw updateError;
    
    return NextResponse.json({ 
      ok: true, 
      workspaceId: inv.workspace_id 
    });
  } catch (error: any) {
    console.error('Join error:', error);
    return NextResponse.json({ 
      error: error?.message || 'join failed' 
    }, { status: 500 });
  }
} 