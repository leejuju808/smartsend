import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createOnboardingLink } from '../../../../../scripts/connectHelpers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { creatorId } = await req.json();

    if (!creatorId) {
      return NextResponse.json({ error: 'Creator ID is required' }, { status: 400 });
    }

    // Verify creator belongs to user
    const { data: creator, error: creatorError } = await supabase
      .from('marketplace_creators')
      .select('stripe_account_id')
      .eq('id', creatorId)
      .eq('user_id', user.id)
      .single();

    if (creatorError || !creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (!creator.stripe_account_id) {
      return NextResponse.json({ error: 'Stripe account not found' }, { status: 400 });
    }

    // Create new onboarding link
    const onboardingUrl = await createOnboardingLink(
      creator.stripe_account_id,
      `${process.env.NEXT_PUBLIC_APP_URL}/creators/me`,
      `${process.env.NEXT_PUBLIC_APP_URL}/creators/me`
    );

    // Emit analytics event
    console.log('creator_onboard_link_opened', { userId: user.id, creatorId });

    return NextResponse.json({
      success: true,
      onboardingUrl,
    });

  } catch (error) {
    console.error('Creator onboarding error:', error);
    return NextResponse.json(
      { error: 'Failed to generate onboarding link' },
      { status: 500 }
    );
  }
} 