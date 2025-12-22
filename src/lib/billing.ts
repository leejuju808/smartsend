// lib/billing.ts
import { stripe } from './stripe';
import { createClient } from '@supabase/supabase-js';

export async function ensureStripeCustomer(
  supabase: ReturnType<typeof createClient>,
  user: { id: string; email?: string | null }
) {
  const { data } = await supabase
    .from('billing_customers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { user_id: user.id },
  });

  await supabase
    .from('billing_customers')
    .insert({ user_id: user.id, stripe_customer_id: customer.id })
    .select()
    .single();

  return customer.id;
}