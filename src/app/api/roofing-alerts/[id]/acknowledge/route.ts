/**
 * Block 24860 — SmartSend Roofing Alerts & Automations v1
 * 
 * POST /api/roofing-alerts/[id]/acknowledge
 * Acknowledges a roofing alert
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const { id } = await params;

    // Update alert status to acknowledged
    const { data, error } = await supabase
      .from('roofing_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) {
      console.error('Error acknowledging alert:', error);
      return NextResponse.json(
        { error: 'Failed to acknowledge alert', details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      alert: data,
    });
  } catch (error: any) {
    console.error('Error in POST /api/roofing-alerts/[id]/acknowledge:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































