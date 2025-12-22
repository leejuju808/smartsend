/**
 * GET /api/import/status/{id}
 * Get import status and progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const importId = params.id;

    if (!importId) {
      return NextResponse.json(
        { error: 'Import ID is required' },
        { status: 400 }
      );
    }

    // Get import log
    const { data: importLog, error: importError } = await supabase
      .from('import_logs')
      .select('*')
      .eq('id', importId)
      .single();

    if (importError || !importLog) {
      return NextResponse.json(
        { error: 'Import not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', importLog.workspace_id)
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Calculate progress percentage
    const progress =
      importLog.total_rows > 0
        ? Math.round((importLog.processed_rows / importLog.total_rows) * 100)
        : 0;

    return NextResponse.json({
      id: importLog.id,
      status: importLog.status,
      progress,
      total_rows: importLog.total_rows,
      processed_rows: importLog.processed_rows,
      imported_count: importLog.imported_count,
      merged_count: importLog.merged_count,
      skipped_count: importLog.skipped_count,
      invalid_count: importLog.invalid_count,
      tags_applied: importLog.tags_applied,
      created_at: importLog.created_at,
      started_at: importLog.started_at,
      completed_at: importLog.completed_at,
      error_message: importLog.error_message,
    });
  } catch (error: any) {
    console.error('Import status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get import status' },
      { status: 500 }
    );
  }
}





















































