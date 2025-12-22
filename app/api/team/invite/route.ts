/**
 * Block 110000: Team Invite API for Roofing Companies
 * POST /api/team/invite - Invite a user to a roofing company
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { company_id, email, role } = body;

    if (!company_id || !email || !role) {
      return NextResponse.json(
        { error: 'company_id, email, and role are required' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'sales', 'estimator', 'production'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if user has permission to invite (owner or admin)
    const { data: membership } = await supabase
      .from('roofing_company_members')
      .select('role')
      .eq('roofing_company_id', company_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can invite team members' },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email.toLowerCase());

    if (existingUser?.user) {
      const { data: existingMember } = await supabase
        .from('roofing_company_members')
        .select('id')
        .eq('roofing_company_id', company_id)
        .eq('user_id', existingUser.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (existingMember) {
        return NextResponse.json(
          { error: 'User is already a member of this company' },
          { status: 400 }
        );
      }
    }

    // Check if there's a pending invite
    const { data: existingInvite } = await supabase
      .from('roofing_team_invites')
      .select('id')
      .eq('roofing_company_id', company_id)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json(
        { error: 'Invite already sent to this email' },
        { status: 400 }
      );
    }

    // Generate invite token
    const token = randomBytes(32).toString('hex');

    // Create invite
    const { data: invite, error: inviteError } = await supabase
      .from('roofing_team_invites')
      .insert({
        roofing_company_id: company_id,
        email: email.toLowerCase(),
        role,
        token,
        invited_by: user.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invite:', inviteError);
      return NextResponse.json(
        { error: inviteError.message },
        { status: 500 }
      );
    }

    // Get company name for email
    const { data: company } = await supabase
      .from('roofing_companies')
      .select('name')
      .eq('id', company_id)
      .single();

    const companyName = company?.name || 'SmartSend';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteLink = `${appUrl}/team/accept?token=${token}`;

    // TODO: Send invitation email
    // await sendEmail(email, `Join ${companyName} on SmartSend`, `
    //   Click to join: ${inviteLink}
    // `);

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        created_at: invite.created_at,
      },
      invite_link: inviteLink,
    });
  } catch (error: any) {
    console.error('Error inviting user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to invite user' },
      { status: 500 }
    );
  }
}
