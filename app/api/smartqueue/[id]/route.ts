// Block 21350 — SmartSend SmartQueue v1
// PATCH /api/smartqueue/[id] - Update SmartQueue item (complete, dismiss, snooze)
// DELETE /api/smartqueue/[id] - Delete SmartQueue item

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();
    const { status, snoozed_until } = body;

    // Validate status
    if (status && !['active', 'completed', 'dismissed', 'snoozed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();
    } else if (status === 'dismissed') {
      updateData.status = 'dismissed';
      updateData.dismissed_at = new Date().toISOString();
    } else if (status === 'snoozed') {
      updateData.status = 'snoozed';
      updateData.snoozed_until = snoozed_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (status === 'active') {
      updateData.status = 'active';
      updateData.completed_at = null;
      updateData.dismissed_at = null;
      updateData.snoozed_until = null;
    }

    // Update SmartQueue item
    const { data, error } = await supabase
      .from('smartqueue_items')
      .update(updateData)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating SmartQueue item:', error);
      return NextResponse.json({ error: 'Failed to update SmartQueue item' }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error: any) {
    console.error('Error in PATCH /api/smartqueue/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Delete SmartQueue item
    const { error } = await supabase
      .from('smartqueue_items')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('Error deleting SmartQueue item:', error);
      return NextResponse.json({ error: 'Failed to delete SmartQueue item' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/smartqueue/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
















































