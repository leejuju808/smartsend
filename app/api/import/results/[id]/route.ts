/**
 * GET /api/import/results/{id}
 * Get detailed import results and summary
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

    // Get summary statistics from import_results
    const { data: results } = await supabase
      .from('import_results')
      .select('action, is_valid, is_duplicate, is_invalid_email, is_missing_email, tags_applied')
      .eq('import_log_id', importId);

    // Calculate detailed stats
    const stats = {
      imported: results?.filter((r) => r.action === 'imported').length || 0,
      merged: results?.filter((r) => r.action === 'merged').length || 0,
      skipped: results?.filter((r) => r.action === 'skipped').length || 0,
      invalid: results?.filter((r) => r.is_invalid_email || r.is_missing_email).length || 0,
      duplicates: results?.filter((r) => r.is_duplicate).length || 0,
    };

    // Aggregate tags applied
    const tagCounts: Record<string, number> = {};
    results?.forEach((r) => {
      if (r.tags_applied && Array.isArray(r.tags_applied)) {
        r.tags_applied.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Build summary report
    const summary = {
      import_id: importLog.id,
      file_name: importLog.file_name,
      status: importLog.status,
      total_rows: importLog.total_rows,
      imported_count: importLog.imported_count || stats.imported,
      merged_count: importLog.merged_count || stats.merged,
      skipped_count: importLog.skipped_count || stats.skipped,
      invalid_count: importLog.invalid_count || stats.invalid,
      duplicate_count: stats.duplicates,
      tags_applied: importLog.tags_applied || tagCounts,
      list_id: importLog.list_id,
      list_name: importLog.list_name,
      created_at: importLog.created_at,
      completed_at: importLog.completed_at,
    };

    return NextResponse.json({
      summary,
      details: {
        contacts_imported: stats.imported,
        contacts_merged: stats.merged,
        contacts_skipped: stats.skipped,
        invalid_emails: stats.invalid,
        duplicates_found: stats.duplicates,
        tags_applied: tagCounts,
      },
    });
  } catch (error: any) {
    console.error('Import results error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get import results' },
      { status: 500 }
    );
  }
}





















































