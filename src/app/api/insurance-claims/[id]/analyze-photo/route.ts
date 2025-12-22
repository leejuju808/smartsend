// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Analyze Photo for Damage Classification
// POST /api/insurance-claims/[id]/analyze-photo

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { classifyDamageFromPhoto } from '@/lib/ai/insurance-damage-classifier';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: claimId } = await params;
    const body = await req.json();
    const { photo_url, photo_category, storage_path } = body;

    if (!photo_url) {
      return NextResponse.json(
        { error: 'photo_url is required' },
        { status: 400 }
      );
    }

    // Verify claim exists
    const { data: claim, error: claimError } = await serviceSupabase
      .from('insurance_claims')
      .select('id')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    // Analyze photo with AI
    const analysis = await classifyDamageFromPhoto(photo_url);

    // Save evidence photo with AI analysis
    const { data: evidencePhoto, error: photoError } = await serviceSupabase
      .from('evidence_photos')
      .insert({
        claim_id: claimId,
        photo_url,
        storage_path,
        photo_category: photo_category || 'damage_closeup',
        ai_damage_type: analysis.damageType,
        ai_damage_types: analysis.damageTypes,
        ai_confidence: analysis.confidence,
        ai_analysis: analysis as any,
        ai_findings: analysis.findings,
        ai_location: analysis.location,
        ai_severity: analysis.severity,
        taken_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (photoError) {
      console.error('Error saving evidence photo:', photoError);
      return NextResponse.json(
        { error: 'Failed to save evidence photo' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      analysis,
      evidence_photo: evidencePhoto,
    });
  } catch (error: any) {
    console.error('Error in POST /api/insurance-claims/[id]/analyze-photo:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















