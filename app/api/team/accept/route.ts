/**
 * Block 110000: Team Accept Invite API
 * GET /api/team/accept?token=xxx - Get invite details
 * POST /api/team/accept - Accept an invite
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Get invite details
    const { data: invite, error: inviteError } = await supabase
      .from('roofing_team_invites')
      .select(`
        id,
        email,
        role,
        status,
        expires_at,
        roofing_company_id,
        roofing_companies (
          id,
          name
        )
      `)
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid or expired invite' },
        { status: 404 }
      );
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: `Invite has been ${invite.status}` },
        { status: 400 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('roofing_team_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id);

      return NextResponse.json(
        { error: 'Invite has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      invite: {
        email: invite.email,
        role: invite.role,
        company: invite.roofing_companies,
      },
    });
  } catch (error: any) {
    console.error('Error getting invite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get invite' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to accept the invite.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from('roofing_team_invites')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid or expired invite' },
        { status: 404 }
      );
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: `Invite has been ${invite.status}` },
        { status: 400 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase
        .from('roofing_team_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id);

      return NextResponse.json(
        { error: 'Invite has expired' },
        { status: 400 }
      );
    }

    // Verify email matches
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invite was sent to a different email address' },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('roofing_company_members')
      .select('id')
      .eq('roofing_company_id', invite.roofing_company_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existingMember) {
      // Mark invite as accepted anyway
      await supabase
        .from('roofing_team_invites')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      return NextResponse.json({
        ok: true,
        message: 'You are already a member of this company',
      });
    }

    // Add user to company
    const { error: memberError } = await supabase
      .from('roofing_company_members')
      .insert({
        roofing_company_id: invite.roofing_company_id,
        user_id: user.id,
        role: invite.role,
        assigned_by_user_id: invite.invited_by,
        is_active: true,
      });

    if (memberError) {
      console.error('Error adding member:', memberError);
      return NextResponse.json(
        { error: memberError.message },
        { status: 500 }
      );
    }

    // Mark invite as accepted
    await supabase
      .from('roofing_team_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    // Log activity
    await supabase
      .from('team_activity')
      .insert({
        user_id: user.id,
        roofing_company_id: invite.roofing_company_id,
        action: 'joined_company',
        metadata: {
          role: invite.role,
          invited_by: invite.invited_by,
        },
      });

    return NextResponse.json({
      ok: true,
      message: 'Successfully joined the company',
      company_id: invite.roofing_company_id,
    });
  } catch (error: any) {
    console.error('Error accepting invite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to accept invite' },
      { status: 500 }
    );
  }
}
