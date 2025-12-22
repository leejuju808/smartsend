// Block 13000 — SmartSend Template Library v1
// GET /api/templates/{id} - Get a specific template by ID

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templateId = params.id;

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    // Try to get from system templates first
    const { data: systemTemplate, error: systemError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (!systemError && systemTemplate) {
      return NextResponse.json({ 
        template: { ...systemTemplate, is_custom: false }
      });
    }

    // If not found in system templates, try user custom templates
    const { data: customTemplate, error: customError } = await supabase
      .from('user_custom_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();

    if (customError || !customTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      template: { ...customTemplate, is_custom: true }
    });
  } catch (error: any) {
    console.error('Error in GET /api/templates/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
