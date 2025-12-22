import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/acl';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sb = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const member_id = form.get('member_id') as string;
    const role = form.get('role') as string;

    if (!member_id || !role) {
      return NextResponse.json({ error: 'member_id and role required' }, { status: 400 });
    }

    // Validate role
    if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }

    // Get member info
    const { data: member, error: memberError } = await sb
      .from('org_members')
      .select('*')
      .eq('id', member_id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Check if requester is admin/owner
    const adminCheck = await requireAdmin();
    if (!adminCheck.ok) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Prevent demoting the last owner
    if (member.role === 'owner' && role !== 'owner') {
      const { count } = await sb
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', member.org_id)
        .eq('role', 'owner');

      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'cannot_demote_last_owner' }, { status: 400 });
      }
    }

    // Update role
    const { error: updateError } = await sb
      .from('org_members')
      .update({ role })
      .eq('id', member_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log to audit
    const { data: { user } } = await sb.auth.getUser();
    const { error: auditError } = await sb
      .from('audit_log')
      .insert({
        org_id: member.org_id,
        user_id: user?.id,
        action: 'member.role_changed',
        target_table: 'org_members',
        target_id: member_id,
        details: { role, previous_role: member.role }
      });

    if (auditError) {
      console.error('Failed to log audit:', auditError);
      // Don't fail the request if audit fails
    }

    return NextResponse.redirect(new URL('/settings/team', req.url));
  } catch (error) {
    console.error('Error in POST /api/members/role:', error);
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }
}

