/**
 * Block 24860 — SmartSend Roofing Alerts & Automations v1
 * 
 * POST /api/roofing-alerts/[id]/execute-fix
 * Executes an automated fix for an alert
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
    const body = await req.json();
    const fix_type = body.fix_type;

    if (!fix_type) {
      return NextResponse.json(
        { error: 'fix_type is required' },
        { status: 400 }
      );
    }

    // Get alert to check if fix is available
    const { data: alert, error: alertError } = await supabase
      .from('roofing_alerts')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();

    if (alertError || !alert) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    if (!alert.auto_fix_available) {
      return NextResponse.json(
        { error: 'No automated fix available for this alert' },
        { status: 400 }
      );
    }

    if (alert.auto_fix_executed) {
      return NextResponse.json(
        { error: 'Automated fix has already been executed' },
        { status: 400 }
      );
    }

    // Execute the fix
    const { data: fixId, error: fixError } = await supabase.rpc('execute_automated_fix', {
      p_alert_id: id,
      p_fix_type: fix_type || alert.auto_fix_type,
    });

    if (fixError) {
      console.error('Error executing fix:', fixError);
      return NextResponse.json(
        { error: 'Failed to execute fix', details: fixError.message },
        { status: 500 }
      );
    }

    // Get updated alert
    const { data: updatedAlert } = await supabase
      .from('roofing_alerts')
      .select('*')
      .eq('id', id)
      .single();

    // Get fix details
    const { data: fix } = await supabase
      .from('automated_fixes')
      .select('*')
      .eq('id', fixId)
      .single();

    return NextResponse.json({
      ok: true,
      alert: updatedAlert,
      fix: fix,
      message: 'Automated fix executed successfully',
    });
  } catch (error: any) {
    console.error('Error in POST /api/roofing-alerts/[id]/execute-fix:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































