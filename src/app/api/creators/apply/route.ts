import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { ensureConnectAccount, createOnboardingLink, upsertCreatorProfile } from '../../../../../scripts/connectHelpers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { displayName, bio, website } = await req.json();

    if (!displayName) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    // Create or update creator profile
    const creatorProfile = await upsertCreatorProfile(user.id, {
      display_name: displayName,
      bio,
      website,
      status: 'pending',
    });

    // Ensure Stripe Connect account exists
    const stripeAccountId = await ensureConnectAccount(user.id, user.email!);

    // Create onboarding link
    const onboardingUrl = await createOnboardingLink(
      stripeAccountId,
      `${process.env.NEXT_PUBLIC_APP_URL}/creators/me`,
      `${process.env.NEXT_PUBLIC_APP_URL}/creators/me`
    );

    // Emit analytics event
    console.log('creator_apply_started', { userId: user.id, creatorId: creatorProfile.id });

    return NextResponse.json({
      success: true,
      creator: creatorProfile,
      onboardingUrl,
    });

  } catch (error) {
    console.error('Creator application error:', error);
    return NextResponse.json(
      { error: 'Failed to process application' },
      { status: 500 }
    );
  }
} 