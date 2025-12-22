/**
 * Background Import Processing Worker
 * Handles enrichment, auto-tagging, deduplication, and finalization
 */

import { createClient } from '@/lib/supabase/server';
import { validateEmail, shouldSkipEmail } from '@/lib/import/email-validation';
import { checkDuplicate } from '@/lib/import/duplicate-detection';

interface ProcessedRow {
  rowNumber: number;
  rawData: Record<string, any>;
  mappedData: {
    email?: string;
    first_name?: string;
    last_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    notes?: string;
    past_quote_amount?: number;
    appointment_date?: string;
  };
  action: 'imported' | 'merged' | 'skipped';
  contactId?: string;
  mergedIntoContactId?: string;
  tagsApplied: string[];
  enrichmentApplied: boolean;
  errorReason?: string;
}

/**
 * Map CSV row to contact fields
 */
function mapRowToContact(
  row: Record<string, any>,
  fieldMapping: Record<string, string>
): ProcessedRow['mappedData'] {
  const mapped: ProcessedRow['mappedData'] = {};

  for (const [csvColumn, fieldName] of Object.entries(fieldMapping)) {
    if (fieldName && row[csvColumn] !== undefined && row[csvColumn] !== null && row[csvColumn] !== '') {
      const value = String(row[csvColumn]).trim();
      
      switch (fieldName) {
        case 'email':
          mapped.email = value.toLowerCase();
          break;
        case 'first_name':
          mapped.first_name = value;
          break;
        case 'last_name':
          mapped.last_name = value;
          break;
        case 'full_name':
          mapped.full_name = value;
          break;
        case 'address':
          mapped.address = value;
          break;
        case 'city':
          mapped.city = value;
          break;
        case 'state':
          mapped.state = value;
          break;
        case 'zip':
        case 'postal_code':
          mapped.zip = value;
          break;
        case 'phone':
          mapped.phone = value;
          break;
        case 'notes':
          mapped.notes = value;
          break;
        case 'past_quote_amount':
          const amount = parseFloat(value.replace(/[^0-9.]/g, ''));
          if (!isNaN(amount)) {
            mapped.past_quote_amount = amount;
          }
          break;
        case 'appointment_date':
          mapped.appointment_date = value;
          break;
      }
    }
  }

  // Split full_name if provided
  if (mapped.full_name && !mapped.first_name && !mapped.last_name) {
    const parts = mapped.full_name.split(/\s+/);
    if (parts.length > 0) {
      mapped.first_name = parts[0];
      if (parts.length > 1) {
        mapped.last_name = parts.slice(1).join(' ');
      }
    }
  }

  return mapped;
}

/**
 * Process a single row
 */
async function processRow(
  row: Record<string, any>,
  rowNumber: number,
  fieldMapping: Record<string, string>,
  defaultTags: string[],
  workspaceId: string,
  supabase: any,
  listId?: string
): Promise<ProcessedRow> {
  const mappedData = mapRowToContact(row, fieldMapping);
  const email = mappedData.email || '';

  // Validate email
  if (!email || email.trim() === '') {
    return {
      rowNumber,
      rawData: row,
      mappedData,
      action: 'skipped',
      tagsApplied: [],
      enrichmentApplied: false,
      errorReason: 'Missing email',
    };
  }

  if (shouldSkipEmail(email)) {
    const validation = validateEmail(email);
    return {
      rowNumber,
      rawData: row,
      mappedData,
      action: 'skipped',
      tagsApplied: [],
      enrichmentApplied: false,
      errorReason: validation.reason || 'Invalid email',
    };
  }

  // Check suppression
  const { data: suppressed } = await supabase
    .from('suppressions')
    .select('email')
    .eq('workspace_id', workspaceId)
    .ilike('email', email)
    .limit(1)
    .single();

  if (suppressed) {
    return {
      rowNumber,
      rawData: row,
      mappedData,
      action: 'skipped',
      tagsApplied: [],
      enrichmentApplied: false,
      errorReason: 'Email is suppressed',
    };
  }

  // Check duplicate
  const duplicateCheck = await checkDuplicate(
    email,
    mappedData.first_name,
    mappedData.last_name,
    mappedData.address,
    mappedData.zip,
    mappedData.phone,
    workspaceId,
    supabase
  );

  if (duplicateCheck.isDuplicate && duplicateCheck.bestMatch) {
    // Merge into existing contact
    const existingContactId = duplicateCheck.bestMatch.contactId;
    
      // Update existing contact with new data (if missing)
      await supabase
        .from('contacts')
        .update({
          first_name: mappedData.first_name || undefined,
          last_name: mappedData.last_name || undefined,
          address: mappedData.address || undefined,
          city: mappedData.city || undefined,
          state: mappedData.state || undefined,
          zip: mappedData.zip || undefined,
          phone: mappedData.phone || undefined,
          notes: mappedData.notes || undefined,
        })
        .eq('id', existingContactId)
        .is('merged_into', null);

      // Apply tags to merged contact
      if (defaultTags.length > 0) {
        for (const tag of defaultTags) {
          await supabase
            .from('contact_tags')
            .upsert({
              workspace_id: workspaceId,
              contact_id: existingContactId,
              tag,
              auto_tagged: true,
            }, {
              onConflict: 'workspace_id,contact_id,tag',
            });
        }
      }

      // Assign to list if specified
      if (listId) {
        await assignToList(existingContactId, listId, workspaceId, supabase);
      }

    return {
      rowNumber,
      rawData: row,
      mappedData,
      action: 'merged',
      contactId: existingContactId,
      mergedIntoContactId: existingContactId,
      tagsApplied: defaultTags,
      enrichmentApplied: false,
    };
  }

  // Create new contact
  const { data: newContact, error: contactError } = await supabase
    .from('contacts')
    .insert({
      workspace_id: workspaceId,
      email,
      first_name: mappedData.first_name || null,
      last_name: mappedData.last_name || null,
      address: mappedData.address || null,
      city: mappedData.city || null,
      state: mappedData.state || null,
      zip: mappedData.zip || null,
      postal_code: mappedData.zip || null,
      phone: mappedData.phone || null,
      notes: mappedData.notes || null,
      source: 'import',
    })
    .select('id')
    .single();

  if (contactError) {
    return {
      rowNumber,
      rawData: row,
      mappedData,
      action: 'skipped',
      tagsApplied: [],
      enrichmentApplied: false,
      errorReason: `Failed to create contact: ${contactError.message}`,
    };
  }

  const contactId = newContact.id;
  const tagsApplied = [...defaultTags];

  // Apply auto-tags
  if (mappedData.past_quote_amount) {
    tagsApplied.push('old_quote');
  }

  // Apply tags to contact
  if (tagsApplied.length > 0) {
    for (const tag of tagsApplied) {
      // Use upsert to add tag
      await supabase
        .from('contact_tags')
        .upsert({
          workspace_id: workspaceId,
          contact_id: contactId,
          tag,
          auto_tagged: true,
        }, {
          onConflict: 'workspace_id,contact_id,tag',
        });
    }
  }

  // Trigger enrichment (async - will be processed by enrichment service)
  await supabase.rpc('get_or_create_enrichment', {
    p_contact_id: contactId,
    p_workspace_id: workspaceId,
  });

  // Trigger auto-tagging
  await supabase.rpc('apply_auto_tags', {
    p_contact_id: contactId,
    p_workspace_id: workspaceId,
  });

  // Block 17900: Enrich phone intelligence if phone number exists
  if (mappedData.phone) {
    try {
      // Get org_id from workspace
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('org_id')
        .eq('id', workspaceId)
        .maybeSingle();
      
      if (workspace?.org_id) {
        const { enrichContactPhone } = await import('@/lib/phone-intelligence/integration');
        await enrichContactPhone(
          supabase,
          contactId,
          mappedData.phone,
          workspace.org_id
        );
      }
    } catch (error) {
      // Don't fail import if phone enrichment fails
      console.error('Error enriching phone intelligence:', error);
    }
  }

  // Assign to list if specified
  if (listId) {
    await assignToList(contactId, listId, workspaceId, supabase);
  }

  return {
    rowNumber,
    rawData: row,
    mappedData,
    action: 'imported',
    contactId,
    tagsApplied,
    enrichmentApplied: true,
  };
}

/**
 * Assign contact to list
 */
async function assignToList(
  contactId: string,
  listId: string,
  workspaceId: string,
  supabase: any
): Promise<void> {
  if (!listId) return;

  await supabase
    .from('contact_list_members')
    .upsert({
      workspace_id: workspaceId,
      list_id: listId,
      contact_id: contactId,
    }, {
      onConflict: 'list_id,contact_id',
    });
}

/**
 * Process import batch
 */
export async function processImportBatch(
  importLogId: string,
  workspaceId: string,
  batchSize: number = 50
): Promise<void> {
  const supabase = createClient();

  // Get import log
  const { data: importLog, error: logError } = await supabase
    .from('import_logs')
    .select('*')
    .eq('id', importLogId)
    .single();

  if (logError || !importLog) {
    throw new Error('Import log not found');
  }

  const fieldMapping = importLog.field_mapping || {};
  const defaultTags = importLog.default_tags || [];
  const listId = importLog.list_id;

  // Get pending rows (where action is null or empty)
  const { data: rows, error: rowsError } = await supabase
    .from('import_results')
    .select('*')
    .eq('import_log_id', importLogId)
    .is('action', null)
    .order('row_number')
    .limit(batchSize);

  if (rowsError || !rows || rows.length === 0) {
    // No more rows to process
    await supabase
      .from('import_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', importLogId);
    return;
  }

  let importedCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  // Process each row
  for (const row of rows) {
    try {
      const processed = await processRow(
        row.raw_data,
        row.row_number,
        fieldMapping,
        defaultTags,
        workspaceId,
        supabase,
        listId
      );

      // Update import_result
      await supabase
        .from('import_results')
        .update({
          email: processed.mappedData.email,
          first_name: processed.mappedData.first_name,
          last_name: processed.mappedData.last_name,
          address: processed.mappedData.address,
          city: processed.mappedData.city,
          state: processed.mappedData.state,
          zip: processed.mappedData.zip,
          phone: processed.mappedData.phone,
          notes: processed.mappedData.notes,
          is_valid: processed.action !== 'skipped',
          is_duplicate: processed.action === 'merged',
          is_invalid_email: processed.errorReason?.includes('email') || false,
          is_missing_email: processed.errorReason === 'Missing email',
          action: processed.action,
          contact_id: processed.contactId,
          merged_into_contact_id: processed.mergedIntoContactId,
          tags_applied: processed.tagsApplied,
          enrichment_applied: processed.enrichmentApplied,
          error_reason: processed.errorReason,
          processed_at: new Date().toISOString(),
          action: processed.action,
        })
        .eq('id', row.id);

      // Update counters
      if (processed.action === 'imported') {
        importedCount++;
      } else if (processed.action === 'merged') {
        mergedCount++;
      } else {
        skippedCount++;
        if (processed.errorReason?.includes('email') || processed.errorReason === 'Missing email') {
          invalidCount++;
        }
      }
    } catch (error: any) {
      console.error(`Error processing row ${row.row_number}:`, error);
      skippedCount++;
      
      await supabase
        .from('import_results')
        .update({
          action: 'skipped',
          error_reason: error.message || 'Processing error',
          processed_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
  }

  // Update import log progress
  const currentProcessed = importLog.processed_rows || 0;
  const currentImported = importLog.imported_count || 0;
  const currentMerged = importLog.merged_count || 0;
  const currentSkipped = importLog.skipped_count || 0;
  const currentInvalid = importLog.invalid_count || 0;

  await supabase
    .from('import_logs')
    .update({
      processed_rows: currentProcessed + rows.length,
      imported_count: currentImported + importedCount,
      merged_count: currentMerged + mergedCount,
      skipped_count: currentSkipped + skippedCount,
      invalid_count: currentInvalid + invalidCount,
    })
    .eq('id', importLogId);

  // If there are more rows, continue processing
  const { data: remainingRows } = await supabase
    .from('import_results')
    .select('id')
    .eq('import_log_id', importLogId)
    .is('action', null)
    .limit(1);

  if (remainingRows && remainingRows.length > 0) {
    // Recursively process next batch
    await processImportBatch(importLogId, workspaceId, batchSize);
  } else {
    // All done - update status
    await supabase
      .from('import_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', importLogId);
  }
}

