/**
 * Block 9400 — AI Personalization Engine v1
 * POST /api/campaigns/test-email
 * Sends a test email to the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { campaign_id, contact_id, subject, body: emailBody } = body;

    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: 'Missing subject or body' },
        { status: 400 }
      );
    }

    // Get campaign to verify access
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, workspace_id, owner_id')
      .eq('id', campaign_id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Verify user has access
    if (campaign.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // TODO: Implement actual email sending
    // For now, just log it
    console.log('Test email would be sent:', {
      to: user.email,
      subject,
      body: emailBody,
      campaign_id,
      contact_id,
    });

    // In a real implementation, you would:
    // 1. Get the sending identity from the campaign
    // 2. Use your email provider (Gmail/Outlook/SMTP) to send
    // 3. Track the send in your email log

    return NextResponse.json({
      success: true,
      message: 'Test email sent (stub - implement actual sending)',
      to: user.email,
    });
  } catch (error: any) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send test email' },
      { status: 500 }
    );
  }
}
























































