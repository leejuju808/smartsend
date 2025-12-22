/**
 * Block 110000: Team Leads Inbox API
 * GET /api/team/leads - Get leads for the company with filters
 * PATCH /api/team/leads/[id]/assign - Assign a lead to a team member
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions/block110000';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get('company_id');
    const filter = searchParams.get('filter'); // 'hot', 'warm', 'needs_followup', 'all'
    const assigned_to = searchParams.get('assigned_to'); // 'me', user_id, or 'unassigned'

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(company_id, user.id, 'can_view_leads');
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to view leads' },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from('leads')
      .select(`
        id,
        email,
        name,
        first_name,
        last_name,
        phone,
        status,
        assigned_to,
        roofing_company_id,
        created_at,
        updated_at,
        profiles:assigned_to (
          id,
          email,
          full_name
        )
      `)
      .eq('roofing_company_id', company_id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filter === 'hot') {
      // Assuming there's a heat_score or similar field
      // For now, filter by status or recent activity
      query = query.in('status', ['new', 'in_progress']);
    } else if (filter === 'warm') {
      query = query.eq('status', 'in_progress');
    } else if (filter === 'needs_followup') {
      // Leads that haven't been updated in a while
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.lt('updated_at', weekAgo.toISOString());
    }

    // Apply assignment filter
    if (assigned_to === 'me') {
      query = query.eq('assigned_to', user.id);
    } else if (assigned_to === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      leads: leads || [],
    });
  } catch (error: any) {
    console.error('Error in team leads API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























