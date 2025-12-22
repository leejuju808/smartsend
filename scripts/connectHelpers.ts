import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CreatorProfile {
  id: string;
  user_id: string;
  display_name: string;
  bio?: string;
  website?: string;
  stripe_account_id?: string;
  rev_share_bps: number;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  created_at: string;
  updated_at: string;
}

/**
 * Ensures a Stripe Connect account exists for a creator
 * Creates a Standard Connect account if none exists
 */
export async function ensureConnectAccount(userId: string, email: string): Promise<string> {
  // Check if creator already has a Stripe account
  const { data: existingCreator } = await supabase
    .from('marketplace_creators')
    .select('stripe_account_id')
    .eq('user_id', userId)
    .single();

  if (existingCreator?.stripe_account_id) {
    return existingCreator.stripe_account_id;
  }

  // Create new Stripe Connect account
  const account = await stripe.accounts.create({
    type: 'standard',
    email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: 'individual',
  });

  // Update creator record with Stripe account ID
  await supabase
    .from('marketplace_creators')
    .update({ stripe_account_id: account.id })
    .eq('user_id', userId);

  return account.id;
}

/**
 * Creates an onboarding link for a Stripe Connect account
 */
export async function createOnboardingLink(
  stripeAccountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return link.url;
}

/**
 * Gets creator profile by user ID
 */
export async function getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  const { data, error } = await supabase
    .from('marketplace_creators')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Creates or updates a creator profile
 */
export async function upsertCreatorProfile(
  userId: string,
  profile: Partial<CreatorProfile>
): Promise<CreatorProfile> {
  const { data, error } = await supabase
    .from('marketplace_creators')
    .upsert(
      {
        user_id: userId,
        ...profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Gets creator balance from payout ledger
 */
export async function getCreatorBalance(creatorId: string): Promise<{
  accrued: number;
  queued: number;
  paid: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('marketplace_payout_ledger')
    .select('amount_cents, status')
    .eq('creator_id', creatorId);

  if (error) throw error;

  const balance = {
    accrued: 0,
    queued: 0,
    paid: 0,
    total: 0,
  };

  data?.forEach((row) => {
    balance[row.status as keyof typeof balance] += row.amount_cents;
    balance.total += row.amount_cents;
  });

  return balance;
} 