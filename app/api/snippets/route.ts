// Block 9300 — Template Library v1
// GET /api/snippets - Get all snippets from snippet_library, grouped by category

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
    const category = url.searchParams.get('category'); // filter by category

    // Build query
    let query = supabase
      .from('snippet_library')
      .select('*')
      .order('category', { ascending: true })
      .order('content', { ascending: true });

    // Filter by category if provided
    if (category) {
      query = query.eq('category', category);
    }

    const { data: snippets, error } = await query;

    if (error) {
      console.error('Error fetching snippets:', error);
      return NextResponse.json({ error: 'Failed to fetch snippets' }, { status: 500 });
    }

    // Group snippets by category
    const grouped: Record<string, Array<{
      id: string;
      content: string;
      placeholders: string[];
    }>> = {};
    
    (snippets || []).forEach((snippet: any) => {
      if (!grouped[snippet.category]) {
        grouped[snippet.category] = [];
      }
      grouped[snippet.category].push({
        id: snippet.id,
        content: snippet.content,
        placeholders: snippet.placeholders || [],
      });
    });

    return NextResponse.json({ snippets: grouped });
  } catch (error: any) {
    console.error('Error in GET /api/snippets:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























































