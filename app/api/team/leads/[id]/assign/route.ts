/**
 * Block 110000: Assign Lead API
 * PATCH /api/team/leads/[id]/assign - Assign a lead to a team member
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions/block110000';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { assigned_to } = body; // user_id or null to unassign

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('roofing_company_id, assigned_to')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    if (!lead.roofing_company_id) {
      return NextResponse.json(
        { error: 'Lead is not associated with a company' },
        { status: 400 }
      );
    }

    // Check permission - users can assign if they can view leads
    // Owners/admins can assign to anyone, others can only assign to themselves
    const hasPermission = await checkPermission(
      lead.roofing_company_id,
      user.id,
      'can_view_leads'
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to assign leads' },
        { status: 403 }
      );
    }

    // If assigning to someone else, check if user is owner/admin
    if (assigned_to && assigned_to !== user.id) {
      const { data: membership } = await supabase
        .from('roofing_company_members')
        .select('role')
        .eq('roofing_company_id', lead.roofing_company_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json(
          { error: 'Only owners and admins can assign leads to other team members' },
          { status: 403 }
        );
      }

      // Verify assigned user is a member of the company
      const { data: assignedMember } = await supabase
        .from('roofing_company_members')
        .select('id')
        .eq('roofing_company_id', lead.roofing_company_id)
        .eq('user_id', assigned_to)
        .eq('is_active', true)
        .single();

      if (!assignedMember) {
        return NextResponse.json(
          { error: 'User is not a member of this company' },
          { status: 400 }
        );
      }
    }

    // Update the lead
    const { error: updateError } = await supabase
      .from('leads')
      .update({ assigned_to: assigned_to || null })
      .eq('id', id);

    if (updateError) {
      console.error('Error assigning lead:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from('team_activity')
      .insert({
        user_id: user.id,
        roofing_company_id: lead.roofing_company_id,
        action: assigned_to ? 'assigned_lead' : 'unassigned_lead',
        entity_type: 'lead',
        entity_id: id,
        metadata: {
          assigned_to: assigned_to || null,
          previous_assigned_to: lead.assigned_to,
        },
      });

    return NextResponse.json({
      ok: true,
      message: assigned_to ? 'Lead assigned successfully' : 'Lead unassigned successfully',
    });
  } catch (error: any) {
    console.error('Error assigning lead:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























