// Block 13000 — SmartSend Template Library v1
// GET /api/templates - List all templates (system + user custom)

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
    const category = url.searchParams.get('category'); // Filter by category
    const includeCustom = url.searchParams.get('include_custom') === 'true'; // Include user custom templates

    // Build query for system templates
    let query = supabase
      .from('templates')
      .select('*')
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    // Filter by category if provided
    if (category) {
      query = query.eq('category', category);
    }

    const { data: systemTemplates, error: systemError } = await query;

    if (systemError) {
      console.error('Error fetching system templates:', systemError);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    let customTemplates: any[] = [];
    
    // Fetch user custom templates if requested
    if (includeCustom) {
      const { data: customData, error: customError } = await supabase
        .from('user_custom_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!customError && customData) {
        customTemplates = customData.map(t => ({
          ...t,
          is_custom: true
        }));
      }
    }

    // Combine system and custom templates
    const allTemplates = [
      ...(systemTemplates || []).map(t => ({ ...t, is_custom: false })),
      ...customTemplates
    ];

    return NextResponse.json({ 
      templates: allTemplates,
      count: allTemplates.length
    });
  } catch (error: any) {
    console.error('Error in GET /api/templates:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
