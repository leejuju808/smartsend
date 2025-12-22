import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getCreatorProfile, getCreatorBalance } from '../../../../../scripts/connectHelpers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get creator profile
    const creatorProfile = await getCreatorProfile(user.id);
    if (!creatorProfile) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    // Get creator balance
    const balance = await getCreatorBalance(creatorProfile.id);

    // Get creator's templates with earnings
    const { data: templates } = await supabase
      .from('marketplace_templates')
      .select(`
        id,
        name,
        description,
        rating,
        installs,
        is_paid,
        price_cents,
        created_at
      `)
      .eq('creator_id', creatorProfile.id)
      .order('created_at', { ascending: false });

    // Get recent payouts
    const { data: recentPayouts } = await supabase
      .from('marketplace_payout_ledger')
      .select(`
        id,
        amount_cents,
        status,
        created_at,
        template:marketplace_templates(name)
      `)
      .eq('creator_id', creatorProfile.id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      creator: creatorProfile,
      balance,
      templates: templates || [],
      recentPayouts: recentPayouts || [],
    });

  } catch (error) {
    console.error('Creator profile error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch creator profile' },
      { status: 500 }
    );
  }
} 