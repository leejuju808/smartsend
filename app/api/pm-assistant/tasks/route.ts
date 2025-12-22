/**
 * Block 256500 — AI Project Manager Assistant v1
 * GET /api/pm-assistant/tasks - Get prioritized tasks for PM
 * POST /api/pm-assistant/tasks - Create a new PM task
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const pm_id = searchParams.get('pm_id');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!pm_id) {
      return NextResponse.json(
        { error: 'pm_id is required' },
        { status: 400 }
      );
    }

    // Get prioritized tasks
    const { data: tasks, error: tasksError } = await supabase.rpc(
      'get_pm_task_priorities',
      { p_pm_id: pm_id, p_limit: limit }
    );

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return NextResponse.json(
        { error: tasksError.message },
        { status: 500 }
      );
    }

    // Filter by status if provided
    let filteredTasks = tasks || [];
    if (status) {
      filteredTasks = filteredTasks.filter(t => t.status === status);
    }

    return NextResponse.json({
      ok: true,
      tasks: filteredTasks,
      count: filteredTasks.length,
    });
  } catch (error: any) {
    console.error('Error in tasks API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pm_id, job_id, task, priority = 'medium', due_date, notes } = body;

    if (!pm_id || !task) {
      return NextResponse.json(
        { error: 'pm_id and task are required' },
        { status: 400 }
      );
    }

    // Create task
    const { data: newTask, error: createError } = await supabase
      .from('pm_tasks')
      .insert({
        pm_id,
        job_id: job_id || null,
        task,
        priority,
        due_date: due_date || null,
        notes: notes || null,
        assigned_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating task:', createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: newTask,
    });
  } catch (error: any) {
    console.error('Error in task creation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















