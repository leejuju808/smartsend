/**
 * Block 24860 — SmartSend Roofing Alerts & Automations v1
 * 
 * GET /api/roofing-alerts/settings
 * Gets alert settings for the current user/workspace
 * 
 * PUT /api/roofing-alerts/settings
 * Updates alert settings
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";
import { z } from "zod";

const updateSettingsSchema = z.object({
  enabled_categories: z.record(z.boolean()).optional(),
  priority_thresholds: z.record(z.enum(['critical', 'high', 'medium', 'low'])).optional(),
  alert_frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']).optional(),
  daily_digest_enabled: z.boolean().optional(),
  daily_digest_time: z.string().optional(),
  job_risk_score_threshold: z.number().int().min(0).max(100).optional(),
  weather_sensitivity: z.enum(['low', 'medium', 'high']).optional(),
  payment_overdue_days: z.number().int().positive().optional(),
  deposit_required_alert: z.boolean().optional(),
  insurance_followup_delay_days: z.number().int().positive().optional(),
  adjuster_response_delay_hours: z.number().int().positive().optional(),
  crew_grading_threshold: z.number().int().min(0).max(100).optional(),
  throttle_minutes: z.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();

    // Get user-specific settings or workspace defaults
    const { data: settings, error } = await supabase
      .from('alert_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching alert settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings', details: error.message },
        { status: 500 }
      );
    }

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        settings: {
          workspace_id: workspaceId,
          user_id: user.id,
          enabled_categories: {
            homeowner: true,
            crew: true,
            supplier: true,
            insurance: true,
            payment: true,
            job_risk: true,
          },
          priority_thresholds: {
            homeowner: 'medium',
            crew: 'medium',
            supplier: 'medium',
            insurance: 'high',
            payment: 'high',
            job_risk: 'high',
          },
          alert_frequency: 'realtime',
          daily_digest_enabled: false,
          daily_digest_time: '08:00:00',
          job_risk_score_threshold: 70,
          weather_sensitivity: 'medium',
          payment_overdue_days: 3,
          deposit_required_alert: true,
          insurance_followup_delay_days: 5,
          adjuster_response_delay_hours: 48,
          crew_grading_threshold: 70,
          throttle_minutes: 20,
        },
      });
    }

    return NextResponse.json({
      settings,
    });
  } catch (error: any) {
    console.error('Error in GET /api/roofing-alerts/settings:', error);
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
    const validated = updateSettingsSchema.parse(body);

    // Check if settings exist
    const { data: existing } = await supabase
      .from('alert_settings')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    const updateData = {
      ...validated,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      // Update existing settings
      const { data, error } = await supabase
        .from('alert_settings')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw error;
      }
      result = data;
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from('alert_settings')
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          ...updateData,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }
      result = data;
    }

    return NextResponse.json({
      ok: true,
      settings: result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error in PUT /api/roofing-alerts/settings:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































