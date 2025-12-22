// Block 10900 — Roofing Templates Library
// GET /api/templates/campaigns/[id] - Get specific template with all steps

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

    // Get user's org_id if available
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_org_id')
      .eq('id', user.id)
      .maybeSingle();

    // Build query: global templates OR org-specific templates
    let query = supabase
      .from('templates_campaigns')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    const { data: template, error } = await query;

    if (error) {
      console.error('Error fetching template:', error);
      return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Check access: must be global OR user's org
    if (!template.is_global && template.org_id !== profile?.current_org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('Error in GET /api/templates/campaigns/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





























































