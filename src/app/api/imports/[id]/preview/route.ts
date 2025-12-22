import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { parse } from 'csv-parse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
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

    // Download CSV file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('imports')
      .download(`${user.id}/${importId}.csv`);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    // Parse CSV to detect headers and get sample rows
    const csvText = await fileData.text();
    const lines = csvText.split('\n').slice(0, 201); // First 200 rows + header
    const csvContent = lines.join('\n');

    return new Promise((resolve) => {
      const results: any[] = [];
      let headers: string[] = [];
      let rowCount = 0;

      parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      })
        .on('data', (row) => {
          if (rowCount === 0) {
            headers = Object.keys(row);
          }
          results.push(row);
          rowCount++;
        })
        .on('end', () => {
          // Log analytics event
          console.log('import_preview_ready', {
            userId: user.id,
            importId,
            headersDetected: headers.length,
            sampleRows: results.length
          });

          resolve(NextResponse.json({
            headersDetected: headers,
            sampleRows: results.slice(0, 20), // Return first 20 rows for preview
            totalRows: rowCount
          }));
        })
        .on('error', (error) => {
          resolve(NextResponse.json(
            { error: 'Failed to parse CSV' },
            { status: 500 }
          ));
        });
    });

  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 