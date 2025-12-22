import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
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
 * POST /api/billing/portal
 * Create a Stripe Customer Portal session
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

    // Get billing info
    const { data: billing } = await supabase
      .from('org_billing')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .single();

    if (!billing?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please subscribe first.' },
        { status: 404 }
      );
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/settings?section=billing`,
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
