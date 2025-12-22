import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

const markReadSchema = z.object({
  alert_id: z.string().uuid(),
  action_taken: z.record(z.any()).optional(), // Track what user did
});

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const payload = markReadSchema.parse(body);

    // Mark alert as read using database function
    const { error: readError } = await supabase.rpc('mark_alert_read', {
      p_alert_id: payload.alert_id,
      p_user_id: user.id,
    });

    if (readError) {
      console.error('Error marking alert as read:', readError);
      return NextResponse.json(
        { error: 'Failed to mark alert as read', details: readError.message },
        { status: 500 }
      );
    }

    // Update action_taken if provided
    if (payload.action_taken) {
      const { error: updateError } = await supabase
        .from('alerts')
        .update({
          action_taken: payload.action_taken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.alert_id)
        .eq('workspace_id', workspaceId);

      if (updateError) {
        console.error('Error updating action_taken:', updateError);
        // Don't fail the request, just log
      }

      // Log action event
      await supabase.from('alert_events').insert({
        alert_id: payload.alert_id,
        workspace_id: workspaceId,
        event_type: 'action_taken',
        action_taken: JSON.stringify(payload.action_taken),
      });
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    console.error('Error in POST /api/alerts/read:', error);
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





















































