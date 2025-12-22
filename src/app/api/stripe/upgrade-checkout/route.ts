import { NextRequest, NextResponse } from 'next/server';
import { stripe, getPriceIdFromPlanId } from '@/lib/billing/stripe';
import { createSupabaseServer } from '@/lib/supabaseServer';

/**
 * Create Stripe Checkout session for plan upgrade
 * POST /api/stripe/upgrade-checkout
 * Body: { orgId: string, plan: 'growth' | 'domination' }
 */
export async function POST(req: NextRequest) {
  try {
    const { orgId, plan } = await req.json();

    if (!orgId || !plan) {
      return NextResponse.json(
        { error: 'orgId and plan are required' },
        { status: 400 }
      );
    }

    if (!['growth', 'domination'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "growth" or "domination"' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServer();

    // Get org billing info
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, billing_customer_id, billing_subscription_id')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Get or create Stripe customer
    let customerId = org.billing_customer_id;

    if (!customerId) {
      // Get org owner email
      const { data: owner } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .limit(1)
        .single();

      if (!owner) {
        return NextResponse.json(
          { error: 'Organization owner not found' },
          { status: 404 }
        );
      }

      const { data: user } = await supabase.auth.admin.getUserById(owner.user_id);
      const email = user.user?.email || `org-${orgId}@smartsend.ai`;

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email,
        metadata: { org_id: orgId },
      });

      customerId = customer.id;

      // Store customer ID
      await supabase
        .from('organizations')
        .update({ billing_customer_id: customerId })
        .eq('id', orgId);

      // Also update org_billing
      await supabase
        .from('org_billing')
        .upsert({
          org_id: orgId,
          stripe_customer_id: customerId,
        }, {
          onConflict: 'org_id',
        });
    }

    // Get price ID for plan
    const priceId = getPriceIdFromPlanId(plan as 'growth' | 'domination');

    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID not configured for plan: ${plan}` },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/billing?upgrade=success&plan=${plan}`,
      cancel_url: `${baseUrl}/billing?upgrade=cancelled`,
      metadata: {
        org_id: orgId,
        plan: plan,
        upgrade: 'true',
      },
      subscription_data: {
        metadata: {
          org_id: orgId,
          plan: plan,
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error: any) {
    console.error('Upgrade checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}




























































