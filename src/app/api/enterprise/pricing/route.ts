import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

/**
 * GET /api/enterprise/pricing
 * Get enterprise pricing tiers (Growth, Scale, Enterprise)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Enterprise pricing matrix
    const pricingTiers = [
      {
        tier: 'growth',
        name: 'Growth',
        users: '10-50',
        deployment: 'Cloud multi-tenant',
        price_monthly: 499,
        price_monthly_range: '$499-$999',
        features: [
          'SmartSend + OpsGrid + AgentCloud',
          '10-50 users',
          'Up to 25,000 emails/month',
          'Standard support',
          '99.9% uptime SLA',
        ],
      },
      {
        tier: 'scale',
        name: 'Scale',
        users: '50-250',
        deployment: 'Dedicated instance',
        price_monthly: 2000,
        price_monthly_range: '$2K-$5K',
        features: [
          'All Growth features',
          '50-250 users',
          'Up to 100,000 emails/month',
          'Priority support',
          '99.95% uptime SLA',
          'Dedicated account manager',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Enterprise',
        users: '250+',
        deployment: 'Private cloud + SLA',
        price_monthly: 10000,
        price_monthly_range: '$10K-$15K',
        features: [
          'All Scale features',
          'Team seats included',
          'High-volume emails',
          'Dedicated support (24/7)',
          '99.95% uptime SLA',
          'Custom integrations',
          'Self-hosted option',
          'FedRamp path available',
        ],
      },
    ];

    return NextResponse.json({ tiers: pricingTiers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

