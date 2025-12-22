import { NextRequest, NextResponse } from 'next/server';
import { stripe, getPriceIdFromPlanId } from '@/lib/billing/stripe';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { cookies } from 'next/headers';

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('current_org_id')?.value || cookieStore.get('org_id')?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

/**
 * POST /api/billing/checkout
 * Create a Stripe Checkout session for plan upgrade
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const body = await req.json();
    const { planId } = body;

    if (!planId || !['starter', 'growth', 'domination'].includes(planId)) {
      return NextResponse.json(
        { error: 'Invalid plan ID' },
        { status: 400 }
      );
    }

    const priceId = getPriceIdFromPlanId(planId as 'starter' | 'growth' | 'domination');
    if (!priceId) {
      return NextResponse.json(
        { error: 'Price ID not configured for this plan' },
        { status: 500 }
      );
    }

    // Get or create Stripe customer
    let customerId: string;

    // Block 20900: Check subscriptions table first
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (subscription?.stripe_customer_id) {
      customerId = subscription.stripe_customer_id;
    } else {
      // Fallback to org_billing for backward compatibility
      const { data: billing } = await supabase
        .from('org_billing')
        .select('stripe_customer_id')
        .eq('org_id', orgId)
        .maybeSingle();

      if (billing?.stripe_customer_id) {
        customerId = billing.stripe_customer_id;
      } else {
      // Get org name for customer creation
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: org?.name || 'SmartSend Organization',
        metadata: {
          org_id: orgId,
        },
      });

        customerId = customer.id;

        // Block 20900: Create subscription record (defaults to starter plan)
        await supabase
          .from('subscriptions')
          .upsert({
            organization_id: orgId,
            stripe_customer_id: customerId,
            plan: 'starter',
            status: 'trialing',
          }, {
            onConflict: 'organization_id',
          });
      }
    }

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
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/settings?section=billing&success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/settings?section=billing&canceled=true`,
      metadata: {
        org_id: orgId,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          org_id: orgId,
          plan_id: planId,
        },
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
