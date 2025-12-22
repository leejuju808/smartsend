// Block 10900 — Roofing Templates Library
// GET /api/templates/campaigns - List all campaign templates

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
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    // Filter: show global templates OR templates for user's org
    if (profile?.current_org_id) {
      query = query.or(`is_global.eq.true,org_id.eq.${profile.current_org_id}`);
    } else {
      query = query.eq('is_global', true);
    }

    const { data: templates, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    console.error('Error in GET /api/templates/campaigns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





























































