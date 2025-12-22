/**
 * GDPR Erasure API Endpoint
 * POST /api/compliance/gdpr-erase
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gdprEraseLead } from '@/lib/compliance/compliance';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, leadId } = await req.json();

    if (!workspaceId || !leadId) {
      return NextResponse.json(
        { error: 'workspaceId and leadId are required' },
        { status: 400 }
      );
    }

    // Get current user for actor tracking
    const authHeader = req.headers.get('authorization');
    let actorId: string | undefined;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      actorId = user?.id;
    }

    // Verify user has access to workspace
    if (actorId) {
      const { data: member } = await supabaseAdmin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', actorId)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: 'Unauthorized: Not a workspace member' },
          { status: 403 }
        );
      }

      // Only owners and admins can erase leads
      if (!['owner', 'admin'].includes(member.role)) {
        return NextResponse.json(
          { error: 'Unauthorized: Admin or owner role required' },
          { status: 403 }
        );
      }
    }

    // Execute GDPR erasure
    const result = await gdprEraseLead(workspaceId, leadId, actorId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'GDPR erasure failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Lead data erased successfully per GDPR request',
    });
  } catch (error: any) {
    console.error('GDPR erasure error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



