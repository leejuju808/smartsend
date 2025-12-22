// app/api/mobile/registerDevice/route.ts
// Block 120000 — Mobile Device Token Registration
// Registers Expo push notification tokens for mobile devices

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { token, platform, device_info } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required field: token' },
        { status: 400 }
      );
    }

    // Upsert device token (update if exists, insert if new)
    const { data, error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform: platform || null,
          device_info: device_info || {},
          last_used_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,token',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error registering device token:', error);
      return NextResponse.json(
        { error: 'Failed to register device token', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      device_token: data,
    });
  } catch (error: any) {
    console.error('Register device error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}


























