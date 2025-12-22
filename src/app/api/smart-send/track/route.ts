/**
 * API Route: Track Email Engagement
 * POST /api/smart-send/track
 */

import { NextRequest, NextResponse } from 'next/server';
import { trackEmailOpen, trackEmailReply, trackEmailSend } from '@/lib/smart-send/behavior-tracker';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, workspaceId, emailLogId, leadId, email } = body;

    if (!eventType || !workspaceId) {
      return NextResponse.json(
        { error: 'eventType and workspaceId are required' },
        { status: 400 }
      );
    }

    switch (eventType) {
      case 'open':
        if (!emailLogId) {
          return NextResponse.json(
            { error: 'emailLogId required for open events' },
            { status: 400 }
          );
        }
        await trackEmailOpen(workspaceId, emailLogId, leadId);
        break;

      case 'reply':
        if (!emailLogId) {
          return NextResponse.json(
            { error: 'emailLogId required for reply events' },
            { status: 400 }
          );
        }
        await trackEmailReply(workspaceId, emailLogId, leadId);
        break;

      case 'send':
        if (!leadId || !email) {
          return NextResponse.json(
            { error: 'leadId and email required for send events' },
            { status: 400 }
          );
        }
        await trackEmailSend(workspaceId, leadId, email);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid eventType. Must be open, reply, or send' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Tracking error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}



























