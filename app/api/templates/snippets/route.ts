// Block 10900 — Roofing Templates Library
// GET /api/templates/snippets - Get snippets grouped by category

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

    // Build query: global snippets OR org-specific snippets
    let query = supabase
      .from('templates_snippets')
      .select('*')
      .order('category', { ascending: true })
      .order('body', { ascending: true });

    // Filter: show global snippets OR snippets for user's org
    if (profile?.current_org_id) {
      query = query.or(`is_global.eq.true,org_id.eq.${profile.current_org_id}`);
    } else {
      query = query.eq('is_global', true);
    }

    const { data: snippets, error } = await query;

    if (error) {
      console.error('Error fetching snippets:', error);
      return NextResponse.json({ error: 'Failed to fetch snippets' }, { status: 500 });
    }

    // Group snippets by category
    const grouped: Record<string, Array<{ id: string; body: string }>> = {};
    
    (snippets || []).forEach((snippet: any) => {
      if (!grouped[snippet.category]) {
        grouped[snippet.category] = [];
      }
      grouped[snippet.category].push({
        id: snippet.id,
        body: snippet.body,
      });
    });

    return NextResponse.json({ snippets: grouped });
  } catch (error: any) {
    console.error('Error in GET /api/templates/snippets:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





























































