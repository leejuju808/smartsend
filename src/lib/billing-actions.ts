'use server';

import { createCheckoutSession, createPortalSession } from '@/lib/stripe';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Server action to create a checkout session
 */
export async function createCheckoutAction(priceId: string) {
  const headersList = await headers();
  const origin = headersList.get('origin') || 'http://localhost:3000';
  
  // Get current user
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', session.user.id)
    .single();

  if (!profile?.email) {
    throw new Error('User email not found');
  }

  const checkoutSession = await createCheckoutSession(
    session.user.id,
    priceId,
    profile.email
  );

  redirect(checkoutSession.url!);
}

/**
 * Server action to create a portal session
 */
export async function createPortalAction() {
  const headersList = await headers();
  const origin = headersList.get('origin') || 'http://localhost:3000';
  
  // Get current user
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    throw new Error('No Stripe customer found for user');
  }

  const portalSession = await createPortalSession(profile.stripe_customer_id);

  redirect(portalSession.url);
}

