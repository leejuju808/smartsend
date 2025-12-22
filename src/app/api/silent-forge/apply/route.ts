/**
 * Block 23200 — Silent Forge Beta Group Application
 * POST /api/silent-forge/apply
 * 
 * Allows roofing companies to apply for the Silent Forge Beta Group
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();

    // Validate required fields
    const requiredFields = [
      'company_name',
      'contact_person',
      'contact_email',
      'annual_revenue',
      'has_crew',
      'crew_count',
      'has_office_person',
      'owner_is_organized',
      'uses_email_daily',
      'uses_phone_daily',
      'hungry_for_improvement',
      'agreed_to_rules'
    ];

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Check if beta group is full
    const { data: activeCount } = await supabase
      .from('silent_forge_beta')
      .select('id', { count: 'exact', head: true })
      .in('status', ['onboarding', 'active']);

    if (activeCount && activeCount >= 10) {
      return NextResponse.json(
        { 
          error: 'Silent Forge Beta Group is currently full (10 companies). Applications are closed.',
          full: true
        },
        { status: 403 }
      );
    }

    // Check if email already applied
    const { data: existing } = await supabase
      .from('silent_forge_applications')
      .select('id, status')
      .eq('contact_email', body.contact_email)
      .single();

    if (existing) {
      return NextResponse.json(
        { 
          error: 'An application with this email already exists',
          application_id: existing.id,
          status: existing.status
        },
        { status: 409 }
      );
    }

    // Create application
    const { data: application, error } = await supabase
      .from('silent_forge_applications')
      .insert({
        company_name: body.company_name,
        contact_person: body.contact_person,
        contact_email: body.contact_email,
        contact_phone: body.contact_phone || null,
        service_area: body.service_area || null,
        annual_revenue: body.annual_revenue,
        has_crew: body.has_crew,
        crew_count: body.crew_count || 0,
        has_office_person: body.has_office_person,
        owner_is_organized: body.owner_is_organized,
        uses_email_daily: body.uses_email_daily,
        uses_phone_daily: body.uses_phone_daily,
        hungry_for_improvement: body.hungry_for_improvement,
        agreed_to_rules: body.agreed_to_rules,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating application:', error);
      return NextResponse.json(
        { error: 'Failed to submit application', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully. We will review your application and get back to you soon.',
      application_id: application.id
    });

  } catch (error: any) {
    console.error('Error in Silent Forge application:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

