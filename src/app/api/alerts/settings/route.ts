import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();

    const { data: settings, error } = await supabase
      .from('alert_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching alert settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings', details: error.message },
        { status: 500 }
      );
    }

    // Return default settings if none exist
    if (!settings) {
      return NextResponse.json({
        channels: {
          hot_lead: ['push', 'in_app', 'email'],
          insurance_claim: ['push', 'in_app', 'email'],
          storm_damage: ['push', 'in_app', 'email'],
          appointment: ['push', 'in_app'],
          system_billing: ['push', 'email'],
          performance_insights: ['in_app'],
        },
        throttle_minutes: 20,
        batch_low_priority: true,
        daily_digest_enabled: true,
        daily_digest_time: '08:00:00',
        priority_overrides: {},
      });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error in GET /api/alerts/settings:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();

    const { data: settings, error } = await supabase
      .from('alert_settings')
      .upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        channels: body.channels,
        throttle_minutes: body.throttle_minutes,
        batch_low_priority: body.batch_low_priority,
        daily_digest_enabled: body.daily_digest_enabled,
        daily_digest_time: body.daily_digest_time,
        priority_overrides: body.priority_overrides || {},
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'workspace_id,user_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating alert settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error in PUT /api/alerts/settings:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































