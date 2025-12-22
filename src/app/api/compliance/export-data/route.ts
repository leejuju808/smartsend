/**
 * GDPR Data Export API Endpoint
 * GET /api/compliance/export-data?workspaceId=xxx&leadId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exportLeadData } from '@/lib/compliance/compliance';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const leadId = searchParams.get('leadId');

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

    // Export lead data
    const result = await exportLeadData(workspaceId, leadId);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Return as JSON download
    return NextResponse.json(result.data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="gdpr-export-${leadId}.json"`,
      },
    });
  } catch (error: any) {
    console.error('Data export error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



