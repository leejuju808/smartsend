/**
 * POST /api/import/start
 * Start the import process - creates import log and queues background processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      file_name,
      file_type = 'csv',
      file_size,
      google_sheet_url,
      field_mapping,
      rows,
      list_id,
      list_name,
      default_tags = [],
      workspace_id,
    } = body;

    if (!file_name || !field_mapping || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: file_name, field_mapping, rows' },
        { status: 400 }
      );
    }

    // Get workspace_id if not provided
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: 'No workspace found' },
          { status: 404 }
        );
      }

      finalWorkspaceId = membership.workspace_id;
    }

    // Create or get list
    let finalListId = list_id;
    if (list_name && !finalListId) {
      // Check if list exists
      const { data: existingList } = await supabase
        .from('contact_lists')
        .select('id')
        .eq('workspace_id', finalWorkspaceId)
        .eq('name', list_name)
        .limit(1)
        .single();

      if (existingList) {
        finalListId = existingList.id;
      } else {
        // Create new list
        const { data: newList, error: listError } = await supabase
          .from('contact_lists')
          .insert({
            workspace_id: finalWorkspaceId,
            name: list_name,
          })
          .select('id')
          .single();

        if (listError) {
          return NextResponse.json(
            { error: `Failed to create list: ${listError.message}` },
            { status: 400 }
          );
        }

        finalListId = newList.id;
      }
    }

    // Create import log
    const { data: importLog, error: importError } = await supabase
      .from('import_logs')
      .insert({
        workspace_id: finalWorkspaceId,
        user_id: user.id,
        file_name,
        file_type,
        file_size,
        google_sheet_url,
        field_mapping,
        list_id: finalListId,
        list_name: list_name || null,
        default_tags,
        status: 'pending',
        total_rows: rows.length,
        metadata: {
          rows_count: rows.length,
          preview_generated: true,
        },
      })
      .select('id')
      .single();

    if (importError) {
      console.error('Import log creation error:', importError);
      return NextResponse.json(
        { error: `Failed to create import log: ${importError.message}` },
        { status: 400 }
      );
    }

    // Store raw rows in import_results for processing
    const importResults = rows.map((row: any, index: number) => ({
      import_log_id: importLog.id,
      workspace_id: finalWorkspaceId,
      row_number: index + 1,
      raw_data: row,
      // action will be null initially, set when processed
    }));

    // Insert in batches to avoid payload size issues
    const batchSize = 100;
    for (let i = 0; i < importResults.length; i += batchSize) {
      const batch = importResults.slice(i, i + batchSize);
      const { error: resultsError } = await supabase
        .from('import_results')
        .insert(batch);

      if (resultsError) {
        console.error('Import results insertion error:', resultsError);
        // Continue anyway - we'll process what we can
      }
    }

    // Update status to processing
    await supabase
      .from('import_logs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', importLog.id);

    // Trigger background processing
    // In production, this would be a queue job (BullMQ, etc.)
    // For now, process asynchronously
    import('@/lib/import/process-import')
      .then(({ processImportBatch }) => {
        processImportBatch(importLog.id, finalWorkspaceId, 50).catch((error) => {
          console.error('Background processing error:', error);
          // Update import log with error
          supabase
            .from('import_logs')
            .update({
              status: 'failed',
              error_message: error.message,
              completed_at: new Date().toISOString(),
            })
            .eq('id', importLog.id);
        });
      })
      .catch((error) => {
        console.error('Failed to start background processing:', error);
      });
    
    // Return immediately with import_id
    return NextResponse.json({
      import_id: importLog.id,
      status: 'processing',
      total_rows: rows.length,
      list_id: finalListId,
      list_name: list_name || null,
    });
  } catch (error: any) {
    console.error('Import start error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start import' },
      { status: 500 }
    );
  }
}

