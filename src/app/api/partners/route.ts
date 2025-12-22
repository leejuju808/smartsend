import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

/**
 * GET /api/partners
 * List regional partners or get partner details
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get('id');
    const region = searchParams.get('region');

    const supabase = createAdminClient();

    let query = supabase.from('regional_partners').select('*');

    if (partnerId) {
      query = query.eq('id', partnerId).single();
    } else if (region) {
      query = query.eq('region', region);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ partners: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/partners
 * Create new regional partner (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      partner_name,
      region,
      city,
      country,
      contact_email,
      contact_name,
      contact_phone,
      company_name,
      website_url,
      revenue_share_percent = 25.0,
      minimum_orgs_required = 25,
      metadata,
    } = body;

    const supabase = createAdminClient();

    const { data: partner, error } = await supabase
      .from('regional_partners')
      .insert({
        partner_name,
        region,
        city,
        country,
        contact_email,
        contact_name,
        contact_phone,
        company_name,
        website_url,
        revenue_share_percent,
        minimum_orgs_required,
        status: 'prospect',
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ partner }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

