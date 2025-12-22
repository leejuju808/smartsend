/**
 * Block 24100 — SmartSend Roofing Message Personalization Engine v1 API
 * 
 * Endpoint: POST /api/personalization/v1
 * 
 * Personalizes email templates using all 5 layers:
 * - Layer 1: Local Area Personalization
 * - Layer 2: Weather + Storm Personalization
 * - Layer 3: Homeowner Behavior Personalization
 * - Layer 4: Roof-Specific Personalization
 * - Layer 5: Human Voice Personalization
 */

import { NextRequest, NextResponse } from 'next/server';
import { personalizeEmailV1Block24100, PersonalizationRequestV1 } from '@/lib/ai/personalization-engine-v1-block24100';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      template_body,
      template_subject,
      contact_id,
      lead_id,
      campaign_id,
      workspace_id,
    } = body;

    // Validate required fields
    if (!template_body || !template_subject || !campaign_id || !workspace_id) {
      return NextResponse.json(
        { error: 'Missing required fields: template_body, template_subject, campaign_id, workspace_id' },
        { status: 400 }
      );
    }

    if (!contact_id && !lead_id) {
      return NextResponse.json(
        { error: 'Either contact_id or lead_id must be provided' },
        { status: 400 }
      );
    }

    // Personalize email
    const request: PersonalizationRequestV1 = {
      template_body,
      template_subject,
      contact_id,
      lead_id,
      campaign_id,
      workspace_id,
    };

    const result = await personalizeEmailV1Block24100(request);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Personalization API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to personalize email',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}






































