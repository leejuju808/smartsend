/**
 * Record Express Consent API Endpoint (CASL)
 * POST /api/compliance/record-consent
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordExpressConsent } from '@/lib/compliance/compliance';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, leadId, legalBasis } = await req.json();

    if (!workspaceId || !leadId) {
      return NextResponse.json(
        { error: 'workspaceId and leadId are required' },
        { status: 400 }
      );
    }

    // Get current user for authorization
    const authHeader = req.headers.get('authorization');
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      
      if (user) {
        // Verify user has access to workspace
        const { data: member } = await supabaseAdmin
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .single();

        if (!member) {
          return NextResponse.json(
            { error: 'Unauthorized: Not a workspace member' },
            { status: 403 }
          );
        }
      }
    }

    // Record consent
    const result = await recordExpressConsent(
      workspaceId,
      leadId,
      legalBasis || 'express_consent'
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to record consent' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Express consent recorded successfully',
    });
  } catch (error: any) {
    console.error('Record consent error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



