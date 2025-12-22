import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

const sendAlertSchema = z.object({
  type: z.enum(['hot_lead', 'insurance_claim', 'storm_damage', 'appointment', 'system_billing', 'performance_insights']),
  title: z.string().min(1),
  message: z.string().min(1),
  contact_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  appointment_id: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
  source: z.string().optional(),
  user_id: z.string().uuid().optional(), // null = workspace-wide alert
});

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const payload = sendAlertSchema.parse(body);

    // Create alert using database function
    const { data: alertId, error } = await supabase.rpc('create_alert', {
      p_workspace_id: workspaceId,
      p_user_id: payload.user_id || user.id,
      p_type: payload.type,
      p_title: payload.title,
      p_message: payload.message,
      p_contact_id: payload.contact_id || null,
      p_campaign_id: payload.campaign_id || null,
      p_appointment_id: payload.appointment_id || null,
      p_metadata: payload.metadata || {},
      p_source: payload.source || null,
    });

    if (error) {
      console.error('Error creating alert:', error);
      return NextResponse.json(
        { error: 'Failed to create alert', details: error.message },
        { status: 500 }
      );
    }

    // TODO: Trigger delivery via push/email/etc based on user settings
    // This will be handled by background workers

    return NextResponse.json({
      ok: true,
      alert_id: alertId,
    });
  } catch (error: any) {
    console.error('Error in POST /api/alerts/send:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































