// Block 13000 — SmartSend Template Library v1
// GET /api/templates/categories - Get all template categories

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

    const { data: categories, error } = await supabase
      .from('template_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching template categories:', error);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    return NextResponse.json({ categories: categories || [] });
  } catch (error: any) {
    console.error('Error in GET /api/templates/categories:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































