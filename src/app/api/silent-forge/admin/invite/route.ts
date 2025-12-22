/**
 * Block 23200 — Silent Forge Beta Group Admin: Invite Company
 * POST /api/silent-forge/admin/invite
 * 
 * Admin endpoint to invite a qualified company to Silent Forge
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/internal
    const { data: profile } = await supabase
      .from('profiles')
      .select('beta_access_level')
      .eq('id', user.id)
      .single();

    if (profile?.beta_access_level !== 'internal') {
      return NextResponse.json(
        { error: 'Forbidden - Internal access only' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      application_id,
      account_id,
      workspace_id,
      company_name,
      contact_person,
      contact_email,
      contact_phone,
      service_area,
      tier, // 'growth' or 'domination'
      annual_revenue_range,
      has_crew,
      crew_count,
      has_office_person,
      owner_is_organized,
      uses_email_daily,
      uses_phone_daily,
      hungry_for_improvement,
      agreed_to_rules
    } = body;

    // Validate tier
    if (!tier || !['growth', 'domination'].includes(tier)) {
      return NextResponse.json(
        { error: 'Tier must be "growth" or "domination"' },
        { status: 400 }
      );
    }

    // Check if beta group is full
    const { data: activeCount } = await supabase
      .from('silent_forge_beta')
      .select('id', { count: 'exact', head: true })
      .in('status', ['onboarding', 'active']);

    if (activeCount && activeCount >= 10) {
      return NextResponse.json(
        { error: 'Silent Forge Beta Group is full (10 companies maximum)' },
        { status: 403 }
      );
    }

    // Create beta entry
    const { data: betaEntry, error: betaError } = await supabase
      .from('silent_forge_beta')
      .insert({
        account_id: account_id || null,
        workspace_id: workspace_id || null,
        company_name,
        contact_person,
        contact_email,
        contact_phone: contact_phone || null,
        service_area: service_area || null,
        tier,
        annual_revenue_range,
        has_crew,
        crew_count: crew_count || 0,
        has_office_person,
        owner_is_organized,
        uses_email_daily,
        uses_phone_daily,
        hungry_for_improvement,
        agreed_to_rules,
        status: 'invited',
        invited_at: new Date().toISOString(),
        lifetime_discount_percent: 50.00
      })
      .select()
      .single();

    if (betaError) {
      console.error('Error creating beta entry:', betaError);
      return NextResponse.json(
        { error: 'Failed to create beta entry', details: betaError.message },
        { status: 500 }
      );
    }

    // Update application status if provided
    if (application_id) {
      await supabase
        .from('silent_forge_applications')
        .update({
          status: 'invited',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: 'Invited to Silent Forge Beta Group'
        })
        .eq('id', application_id);
    }

    return NextResponse.json({
      success: true,
      message: 'Company invited to Silent Forge Beta Group',
      beta_id: betaEntry.id,
      locked_price: betaEntry.locked_price_monthly
    });

  } catch (error: any) {
    console.error('Error inviting to Silent Forge:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}







































