import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { parse } from 'csv-parse';
import { shouldSend, logSendEvent } from '@/lib/sendGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FieldMapping {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  custom?: string[];
}

interface CommitRequest {
  mapping: FieldMapping;
  dedupeStrategy: 'email';
  onConflict: 'skip' | 'update';
  respectSuppression: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if feature is enabled
    if (process.env.CONTACTS_IMPORT_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'Contacts import is not enabled' },
        { status: 403 }
      );
    }

    const importId = params.id;
    const body: CommitRequest = await request.json();

    // Get authenticated user
    const cookieStore = cookies();
    const supabaseAuth = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get import job
    const { data: importJob, error: jobError } = await supabase
      .from('contact_imports')
      .select('*')
      .eq('id', importId)
      .eq('user_id', user.id)
      .single();

    if (jobError || !importJob) {
      return NextResponse.json(
        { error: 'Import job not found' },
        { status: 404 }
      );
    }

    // Update status to processing
    await supabase
      .from('contact_imports')
      .update({ status: 'processing' })
      .eq('id', importId);

    // Download CSV file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('imports')
      .download(`${user.id}/${importId}.csv`);

    if (downloadError || !fileData) {
      await supabase
        .from('contact_imports')
        .update({ 
          status: 'failed',
          error: 'Failed to download file'
        })
        .eq('id', importId);

      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    // Process CSV in background
    processCSVImport(user.id, importId, fileData, body);

    return NextResponse.json({
      message: 'Import started',
      importId,
      status: 'processing'
    });

  } catch (error) {
    console.error('Commit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processCSVImport(
  userId: string,
  importId: string,
  fileData: Blob,
  config: CommitRequest
) {
  try {
    const csvText = await fileData.text();
    const results: any[] = [];
    let totalRows = 0;
    let insertedRows = 0;
    let skippedRows = 0;
    let updatedRows = 0;

    // Parse CSV
    await new Promise((resolve, reject) => {
      parse(csvText, {
        columns: true,
        skip_empty_lines: true
      })
        .on('data', (row) => {
          results.push(row);
          totalRows++;
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Process in batches
    const batchSize = 1000;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const contacts = [];
      const skipped = [];

      for (const row of batch) {
        const email = row[config.mapping.email]?.trim().toLowerCase();
        
        // Validate email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
          skipped.push({ email, reason: 'invalid_email' });
          skippedRows++;
          continue;
        }

        // Check suppression if enabled
        if (config.respectSuppression) {
          const sendCheck = await shouldSend(userId, email);
          if (!sendCheck.ok) {
            await logSendEvent(userId, email, 'skipped_suppressed');
            skipped.push({ email, reason: 'suppressed' });
            skippedRows++;
            continue;
          }
        }

        // Build contact object
        const contact: any = {
          user_id: userId,
          email
        };

        if (config.mapping.first_name && row[config.mapping.first_name]) {
          contact.first_name = row[config.mapping.first_name].trim();
        }
        if (config.mapping.last_name && row[config.mapping.last_name]) {
          contact.last_name = row[config.mapping.last_name].trim();
        }
        if (config.mapping.company && row[config.mapping.company]) {
          contact.company = row[config.mapping.company].trim();
        }
        if (config.mapping.title && row[config.mapping.title]) {
          contact.title = row[config.mapping.title].trim();
        }
        if (config.mapping.phone && row[config.mapping.phone]) {
          contact.phone = row[config.mapping.phone].trim();
        }

        // Handle custom fields
        if (config.mapping.custom && config.mapping.custom.length > 0) {
          const custom: Record<string, any> = {};
          for (const customField of config.mapping.custom) {
            if (row[customField]) {
              custom[customField] = row[customField].trim();
            }
          }
          if (Object.keys(custom).length > 0) {
            contact.custom = custom;
          }
        }

        contacts.push(contact);
      }

      // Batch upsert contacts
      if (contacts.length > 0) {
        const { data, error } = await supabase
          .from('contacts')
          .upsert(contacts, {
            onConflict: 'user_id,email',
            ignoreDuplicates: config.onConflict === 'skip'
          });

        if (error) {
          console.error('Batch upsert error:', error);
          // Continue with next batch
        } else {
          if (config.onConflict === 'update') {
            updatedRows += contacts.length;
          } else {
            insertedRows += contacts.length;
          }
        }
      }
    }

    // Update import job with results
    await supabase
      .from('contact_imports')
      .update({
        status: 'done',
        total_rows: totalRows,
        inserted_rows: insertedRows,
        skipped_rows: skippedRows,
        finished_at: new Date().toISOString()
      })
      .eq('id', importId);

    // Log analytics event
    console.log('import_completed', {
      userId,
      importId,
      totalRows,
      insertedRows,
      updatedRows,
      skippedRows
    });

  } catch (error) {
    console.error('CSV processing error:', error);
    
    // Update import job with error
    await supabase
      .from('contact_imports')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        finished_at: new Date().toISOString()
      })
      .eq('id', importId);
  }
} 