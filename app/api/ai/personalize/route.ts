/**
 * Block 9400 — AI Personalization Engine v1
 * POST /api/ai/personalize
 * 
 * Personalizes email templates with:
 * - Token replacement
 * - Dynamic data (weather, local references)
 * - Human rewrite
 * - Tone control
 * - Spam reduction
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { personalizeEmail, PersonalizationRequest } from '@/lib/ai/personalization-engine';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { template_body, template_subject, contact_id, campaign_id } = body;

    // Validate required fields
    if (!template_body || !template_subject || !contact_id || !campaign_id) {
      return NextResponse.json(
        {
          error: 'Missing required fields: template_body, template_subject, contact_id, campaign_id',
        },
        { status: 400 }
      );
    }

    // Verify user has access to contact and campaign
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, workspace_id')
      .eq('id', contact_id)
      .single();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, workspace_id, owner_id')
      .eq('id', campaign_id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Check workspace access
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', campaign.workspace_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Personalize the email
    const request: PersonalizationRequest = {
      template_body,
      template_subject,
      contact_id,
      campaign_id,
    };

    const result = await personalizeEmail(request);

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
      metadata: result.metadata,
    });
  } catch (error: any) {
    console.error('Personalization error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to personalize email' },
      { status: 500 }
    );
  }
}
























































