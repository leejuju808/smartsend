// Block 10400 — Smart Personalization Engine v1
// Settings API for personalization preferences

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from('personalization_settings')
      .select('enabled, tone')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return defaults if no settings exist
    return NextResponse.json({
      enabled: settings?.enabled ?? true,
      tone: settings?.tone ?? 'direct',
    });
  } catch (error: any) {
    console.error('Error fetching personalization settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { enabled, tone } = body;

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled must be a boolean' },
        { status: 400 }
      );
    }

    if (tone && !['friendly', 'direct', 'professional'].includes(tone)) {
      return NextResponse.json(
        { error: 'tone must be one of: friendly, direct, professional' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('personalization_settings')
      .upsert({
        user_id: user.id,
        enabled: enabled ?? true,
        tone: tone ?? 'direct',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error updating personalization settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}

