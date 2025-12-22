import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Check if feature is enabled
    if (process.env.CONTACTS_IMPORT_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'Contacts import is not enabled' },
        { status: 403 }
      );
    }

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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Only CSV files are supported' },
        { status: 400 }
      );
    }

    // Create import job record
    const { data: importJob, error: insertError } = await supabase
      .from('contact_imports')
      .insert({
        user_id: user.id,
        filename: file.name,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create import job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create import job' },
        { status: 500 }
      );
    }

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('imports')
      .upload(`${user.id}/${importJob.id}.csv`, file);

    if (uploadError) {
      // Clean up the import job if upload fails
      await supabase
        .from('contact_imports')
        .delete()
        .eq('id', importJob.id);

      console.error('Failed to upload file:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Log analytics event
    console.log('import_upload_started', {
      userId: user.id,
      importId: importJob.id,
      filename: file.name,
      fileSize: file.size
    });

    return NextResponse.json({
      importId: importJob.id,
      filename: file.name,
      status: 'pending'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 