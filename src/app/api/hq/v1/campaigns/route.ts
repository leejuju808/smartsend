import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/aurev-hq/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/hq/v1/campaigns - List campaigns
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Verify user has access to org
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', auth.userId!)
      .eq('org_id', orgId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get campaigns
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

