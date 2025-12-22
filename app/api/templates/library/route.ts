// Block 9300 — Template Library v1
// GET /api/templates/library - List all templates from template_library

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const templateType = url.searchParams.get('type'); // 'campaign' | 'email' | 'snippet' | null (all)
    const category = url.searchParams.get('category'); // filter by category

    // Build query
    let query = supabase
      .from('template_library')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    // Filter by type if provided
    if (templateType && ['campaign', 'email', 'snippet'].includes(templateType)) {
      query = query.eq('template_type', templateType);
    }

    // Filter by category if provided
    if (category) {
      query = query.eq('category', category);
    }

    const { data: templates, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    console.error('Error in GET /api/templates/library:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























































