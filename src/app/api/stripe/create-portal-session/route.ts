import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
import { createSupabaseServer } from '@/lib/supabaseServer';

/**
 * Create Stripe Billing Portal session
 * POST /api/stripe/create-portal-session
 * Body: { orgId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await req.json();

    if (!orgId) {
      return NextResponse.json(
        { error: 'orgId is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServer();

    // Get org billing info
    const { data: org } = await supabase
      .from('organizations')
      .select('billing_customer_id')
      .eq('id', orgId)
      .single();

    if (!org?.billing_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found for this organization' },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: org.billing_customer_id,
      return_url: `${baseUrl}/billing`,
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (error: any) {
    console.error('Portal session error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
