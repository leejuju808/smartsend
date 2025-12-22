import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/aurev-hq/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/hq/v1/leads - List leads
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

    // Get leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// POST /api/hq/v1/leads - Create lead
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  try {
    const { org_id, email, first_name, last_name, company, title } = await req.json();

    if (!org_id || !email) {
      return NextResponse.json({ error: 'org_id and email are required' }, { status: 400 });
    }

    // Verify user has access to org
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', auth.userId!)
      .eq('org_id', org_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create lead
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({ org_id, email, first_name, last_name, company, title })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

