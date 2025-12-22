/**
 * Block 19750 — Enroll User in Beta
 * API endpoint to enroll a user in a specific beta phase
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is internal/admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('beta_access_level')
      .eq('id', user.id)
      .single();

    if (profile?.beta_access_level !== 'internal') {
      return NextResponse.json({ error: 'Forbidden - Internal access only' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, phase, notes } = body;

    if (!userId || !phase) {
      return NextResponse.json(
        { error: 'userId and phase are required' },
        { status: 400 }
      );
    }

    if (!['internal', 'alpha', 'beta', 'founders'].includes(phase)) {
      return NextResponse.json(
        { error: 'Invalid phase. Must be: internal, alpha, beta, or founders' },
        { status: 400 }
      );
    }

    // Enroll user using database function
    const { error: enrollError } = await supabase.rpc('enroll_inbox_beta', {
      p_user_id: userId,
      p_phase: phase,
      p_enrolled_by: user.id,
      p_notes: notes || null,
    });

    if (enrollError) {
      console.error('Error enrolling user:', enrollError);
      return NextResponse.json(
        { error: enrollError.message || 'Failed to enroll user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: `User enrolled in ${phase} phase` });
  } catch (error: any) {
    console.error('Error enrolling user:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



















































