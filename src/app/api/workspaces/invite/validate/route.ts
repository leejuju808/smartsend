import { NextRequest, NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/userClient';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    
    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }

    const sb = userClient();
    
    // Find invitation with workspace details
    const { data: invite, error } = await sb
      .from('workspace_invites')
      .select(`
        *,
        workspaces!inner(id, name)
      `)
      .eq('token', token)
      .maybeSingle();
      
    if (error) throw error;
    
    if (!invite) {
      return NextResponse.json({ error: 'invalid token' }, { status: 404 });
    }
    
    if (invite.redeemed_at) {
      return NextResponse.json({ error: 'already used' }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      invite: {
        id: invite.id,
        workspace_id: invite.workspace_id,
        workspace_name: invite.workspaces.name,
        email: invite.email,
        role: invite.role,
        created_at: invite.created_at
      }
    });
  } catch (error: any) {
    console.error('Token validation error:', error);
    return NextResponse.json({ 
      error: error?.message || 'validation failed' 
    }, { status: 500 });
  }
} 