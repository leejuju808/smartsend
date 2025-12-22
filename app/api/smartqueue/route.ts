// Block 21350 — SmartSend SmartQueue v1
// GET /api/smartqueue - Get SmartQueue items (role-based, Money Mode support)
// POST /api/smartqueue/refresh - Refresh SmartQueue

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export type SmartQueueItem = {
  id: string;
  workspaceId: string;
  userId?: string;
  sourceType: string;
  sourceId?: string;
  taskCategory: 'high_roi' | 'medium_roi' | 'low_roi';
  taskType: string;
  title: string;
  description?: string;
  reason?: string;
  contactId?: string;
  leadId?: string;
  threadId?: string;
  proposalId?: string;
  priorityScore: number;
  scoreBreakdown?: Record<string, any>;
  actionButtons?: Array<{
    label: string;
    action: string;
    url: string;
  }>;
  dueAt: string;
  dueDate?: string;
  status: 'active' | 'completed' | 'dismissed' | 'snoozed';
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export async function GET(req: NextRequest) {
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

    // Parse query parameters
    const url = new URL(req.url);
    const role = url.searchParams.get('role'); // 'owner', 'sales_rep', 'office_staff', 'adjuster_helper'
    const moneyMode = url.searchParams.get('money_mode') === 'true';
    const userId = url.searchParams.get('user_id'); // Filter by specific user

    // Call database function to get SmartQueue
    const { data: items, error } = await supabase.rpc('get_smartqueue', {
      p_workspace_id: workspaceId,
      p_user_id: userId || null,
      p_role: role || null,
      p_money_mode: moneyMode || false,
    });

    if (error) {
      console.error('Error fetching SmartQueue:', error);
      return NextResponse.json({ error: 'Failed to fetch SmartQueue' }, { status: 500 });
    }

    // Transform to SmartQueueItem format
    const smartQueueItems: SmartQueueItem[] = (items || []).map((item: any) => ({
      id: item.id,
      workspaceId: item.workspace_id,
      userId: item.user_id,
      sourceType: item.source_type,
      sourceId: item.source_id,
      taskCategory: item.task_category,
      taskType: item.task_type,
      title: item.title,
      description: item.description,
      reason: item.reason,
      contactId: item.contact_id,
      leadId: item.lead_id,
      threadId: item.thread_id,
      proposalId: item.proposal_id,
      priorityScore: parseFloat(item.priority_score) || 0,
      scoreBreakdown: item.score_breakdown,
      actionButtons: item.action_buttons,
      dueAt: item.due_at,
      dueDate: item.due_date,
      status: item.status,
      metadata: item.metadata,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    // Group by category
    const grouped = {
      high_roi: smartQueueItems.filter(item => item.taskCategory === 'high_roi'),
      medium_roi: smartQueueItems.filter(item => item.taskCategory === 'medium_roi'),
      low_roi: smartQueueItems.filter(item => item.taskCategory === 'low_roi'),
    };

    return NextResponse.json({
      items: smartQueueItems,
      grouped,
      total: smartQueueItems.length,
      highRoiCount: grouped.high_roi.length,
      mediumRoiCount: grouped.medium_roi.length,
      lowRoiCount: grouped.low_roi.length,
    });
  } catch (error: any) {
    console.error('Error in GET /api/smartqueue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
    const action = body.action;

    if (action === 'refresh') {
      // Refresh SmartQueue
      const userId = body.user_id || null;
      
      const { error: refreshError } = await supabase.rpc('refresh_smartqueue', {
        p_workspace_id: workspaceId,
        p_user_id: userId,
      });

      if (refreshError) {
        console.error('Error refreshing SmartQueue:', refreshError);
        return NextResponse.json({ error: 'Failed to refresh SmartQueue' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true,
        message: 'SmartQueue refreshed successfully'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in POST /api/smartqueue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
















































