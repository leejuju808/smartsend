import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/aurev-hq/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/hq/v1/orgs/:id - Get org details
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  try {
    const id = req.nextUrl.pathname.split('/').pop();

    // Check if user is member of org
    const { data: membership, error } = await supabase
      .from('org_members')
      .select('org_id, role, orgs!inner(id, name, created_at)')
      .eq('user_id', auth.userId!)
      .eq('org_id', id)
      .single();

    if (error || !membership) {
      return NextResponse.json({ error: 'Org not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: membership.orgs.id,
      name: membership.orgs.name,
      role: membership.role,
      created_at: membership.orgs.created_at
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// PATCH /api/hq/v1/orgs/:id - Update org (admins only)
export const PATCH = withApiAuth(async (req: NextRequest, auth) => {
  try {
    const id = req.nextUrl.pathname.split('/').pop();
    const { name } = await req.json();

    // Check if user is admin or owner
    const { data: membership, error } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', auth.userId!)
      .eq('org_id', id)
      .single();

    if (error || !membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update org
    const { data: org, error: updateError } = await supabase
      .from('orgs')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ org });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

