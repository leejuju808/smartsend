/**
 * Block 110000: Crew Manager API
 * GET /api/team/crews - Get crews for a company
 * POST /api/team/crews - Create a new crew
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

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(company_id, user.id, 'can_manage_crews');
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to view crews' },
        { status: 403 }
      );
    }

    const { data: crews, error } = await supabase
      .from('crews')
      .select('*')
      .eq('roofing_company_id', company_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching crews:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      crews: crews || [],
    });
  } catch (error: any) {
    console.error('Error in crews API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { company_id, name, color } = body;

    if (!company_id || !name) {
      return NextResponse.json(
        { error: 'company_id and name are required' },
        { status: 400 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(company_id, user.id, 'can_manage_crews');
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to create crews' },
        { status: 403 }
      );
    }

    const { data: crew, error } = await supabase
      .from('crews')
      .insert({
        roofing_company_id: company_id,
        name,
        color: color || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating crew:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase
      .from('team_activity')
      .insert({
        user_id: user.id,
        roofing_company_id: company_id,
        action: 'created_crew',
        entity_type: 'crew',
        entity_id: crew.id,
        metadata: {
          crew_name: name,
        },
      });

    return NextResponse.json({
      ok: true,
      crew,
    });
  } catch (error: any) {
    console.error('Error creating crew:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























