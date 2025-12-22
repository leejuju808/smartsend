import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/aurev-hq/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/hq/v1/orgs - List orgs for the authenticated user
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  try {
    const { data: orgs, error } = await supabase
      .from('org_members')
      .select('org_id, role, orgs!inner(id, name, created_at)')
      .eq('user_id', auth.userId!);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      orgs: orgs.map((m: any) => ({
        id: m.org_id,
        name: m.orgs.name,
        role: m.role,
        created_at: m.orgs.created_at
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// POST /api/hq/v1/orgs - Create a new org
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  try {
    const { name } = await req.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create org
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .insert({ name, owner_id: auth.userId })
      .select()
      .single();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // Add creator as owner member
    const { error: memberError } = await supabase
      .from('org_members')
      .insert({ org_id: org.id, user_id: auth.userId!, role: 'owner' });

    if (memberError) {
      // Rollback org creation
      await supabase.from('orgs').delete().eq('id', org.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json({ org }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

