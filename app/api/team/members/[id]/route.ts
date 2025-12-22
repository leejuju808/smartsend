/**
 * Block 12900: Team Member Management API
 * PATCH /api/team/members/[id] - Update member role
 * DELETE /api/team/members/[id] - Remove member
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { checkPermission } from '@/src/lib/permissions/block12900';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { role } = body;

    if (!role || !['owner', 'manager', 'staff', 'read_only'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Get membership to update
    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('org_id, user_id, role')
      .eq('id', params.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'Membership not found' },
        { status: 404 }
      );
    }

    // Block 12900: Check permission to change roles
    const canChangeRole = await checkPermission(
      membership.org_id,
      user.id,
      'team.change_role'
    );

    if (!canChangeRole) {
      return NextResponse.json(
        {
          error: 'insufficient_permissions',
          message: 'You don\'t have permission to change member roles.',
        },
        { status: 403 }
      );
    }

    // Prevent changing owner role (only owner can transfer ownership)
    if (membership.role === 'owner' && role !== 'owner') {
      // Check if current user is owner
      const { data: currentUserMembership } = await supabase
        .from('org_memberships')
        .select('role')
        .eq('org_id', membership.org_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (currentUserMembership?.role !== 'owner') {
        return NextResponse.json(
          { error: 'Only the owner can change the owner role' },
          { status: 403 }
        );
      }
    }

    // Update role
    const { error: updateError } = await supabase
      .from('org_memberships')
      .update({ role })
      .eq('id', params.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update member role' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get membership to delete
    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('org_id, user_id, role')
      .eq('id', params.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'Membership not found' },
        { status: 404 }
      );
    }

    // Block 12900: Check permission to remove users
    const canRemoveUser = await checkPermission(
      membership.org_id,
      user.id,
      'team.remove_user'
    );

    if (!canRemoveUser) {
      return NextResponse.json(
        {
          error: 'insufficient_permissions',
          message: 'You don\'t have permission to remove team members.',
        },
        { status: 403 }
      );
    }

    // Prevent removing owner (they must transfer ownership first)
    if (membership.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove owner. Transfer ownership first.' },
        { status: 400 }
      );
    }

    // Delete membership
    const { error: deleteError } = await supabase
      .from('org_memberships')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove member' },
      { status: 500 }
    );
  }
}




























































