/**
 * GET /api/financing/applications/[id]
 * Get financing application details
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = params;

    // Get application with offers and events
    const { data: application, error: applicationError } = await supabase
      .from('financing_applications')
      .select(
        `
        *,
        financing_offers(*),
        financing_events(*)
        `
      )
      .eq('id', id)
      .single();

    if (applicationError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: any) {
    console.error('Error getting financing application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get application' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/financing/applications/[id]
 * Update financing application (e.g., accept offer, withdraw)
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { status, offerId, notes } = body;

    // Get current application
    const { data: currentApp } = await supabase
      .from('financing_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentApp) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // Update application
    const updateData: any = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const { data: application, error: updateError } = await supabase
      .from('financing_applications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    // If offer was accepted, log event
    if (offerId && status === 'approved') {
      const { data: offer } = await supabase
        .from('financing_offers')
        .select('*')
        .eq('id', offerId)
        .single();

      if (offer) {
        await supabase.from('financing_events').insert({
          application_id: id,
          event_type: 'offer_accepted',
          message: `Customer accepted offer: ${offer.plan_name}`,
          event_data: {
            offerId: offer.id,
            planName: offer.plan_name,
            monthlyPayment: offer.monthly_payment,
          },
          triggered_by: user.id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: any) {
    console.error('Error updating financing application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update application' },
      { status: 500 }
    );
  }
}





















