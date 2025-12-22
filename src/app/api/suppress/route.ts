import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { suppressEmail } from '@/lib/sendGuard';

export async function POST(request: NextRequest) {
  try {
    // Check if feature is enabled
    if (process.env.SEND_GUARD_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'SendGuard is not enabled' },
        { status: 403 }
      );
    }

    const { email, reason } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const cookieStore = cookies();
    const supabaseAuth = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate reason
    const validReasons = ['manual', 'bounced', 'complaint', 'unsubscribed'];
    const validReason = validReasons.includes(reason) ? reason : 'manual';

    // Suppress email
    const result = await suppressEmail(user.id, email, validReason);

    if (result.success) {
      // Log analytics event
      console.log('email_suppressed', {
        userId: user.id,
        email,
        reason: validReason
      });

      return NextResponse.json({
        success: true,
        message: 'Email suppressed successfully'
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to suppress email' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Suppression error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 