/**
 * Block 15700 — Personalization Engine v2
 * Main API endpoint for v2 personalization
 * 
 * POST /api/personalization/v2
 * Body: { template_body: string, template_subject: string, contact_id: string, campaign_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { personalizeEmailV2, PersonalizationRequestV2 } from '@/lib/ai/personalization-engine-v2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { template_body, template_subject, contact_id, campaign_id } = body;

    if (!template_body || !template_subject || !contact_id || !campaign_id) {
      return NextResponse.json(
        { error: 'template_body, template_subject, contact_id, and campaign_id are required' },
        { status: 400 }
      );
    }

    const request: PersonalizationRequestV2 = {
      template_body,
      template_subject,
      contact_id,
      campaign_id,
    };

    const result = await personalizeEmailV2(request);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Personalization v2 API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate personalization' },
      { status: 500 }
    );
  }
}





















































