// Block 13000 — SmartSend Template Library v1
// POST /api/templates/custom - Create a custom user template

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { title, category, subject, body: templateBody, cta, workspace_id } = body;

    // Validate required fields
    if (!title || !category || !templateBody) {
      return NextResponse.json({ 
        error: 'Title, category, and body are required' 
      }, { status: 400 });
    }

    // Get workspace_id if not provided
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      finalWorkspaceId = membership?.workspace_id || null;
    }

    // Insert custom template
    const { data: customTemplate, error: insertError } = await supabase
      .from('user_custom_templates')
      .insert({
        user_id: user.id,
        workspace_id: finalWorkspaceId,
        title,
        category,
        subject: subject || null,
        body: templateBody,
        cta: cta || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating custom template:', insertError);
      return NextResponse.json({ 
        error: 'Failed to create custom template',
        details: insertError.message
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      template: { ...customTemplate, is_custom: true }
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/templates/custom:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

