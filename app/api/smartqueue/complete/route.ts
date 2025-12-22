// Block 21350 — SmartSend SmartQueue v1
// POST /api/smartqueue/complete - Complete a SmartQueue item by source

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
    }

    const body = await req.json();
    const { item_id, source_type, source_id } = body;

    if (!item_id && (!source_type || !source_id)) {
      return NextResponse.json({ error: 'item_id or source_type+source_id required' }, { status: 400 });
    }

    // Update SmartQueue item
    const updateQuery = supabase
      .from('smartqueue_items')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId);

    if (item_id) {
      updateQuery.eq('id', item_id);
    } else {
      updateQuery.eq('source_type', source_type).eq('source_id', source_id);
    }

    const { data, error } = await updateQuery.select().single();

    if (error) {
      console.error('Error completing SmartQueue item:', error);
      return NextResponse.json({ error: 'Failed to complete SmartQueue item' }, { status: 500 });
    }

    // If this was a task_v3, also complete the original task
    if (data.source_type === 'task_v3' && data.source_id) {
      await supabase
        .from('tasks_v3')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', data.source_id);
    }

    return NextResponse.json({ 
      success: true,
      item: data
    });
  } catch (error: any) {
    console.error('Error in POST /api/smartqueue/complete:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
















































