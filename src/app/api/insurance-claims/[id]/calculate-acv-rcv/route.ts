// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Calculate ACV/RCV
// POST /api/insurance-claims/[id]/calculate-acv-rcv

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateACVRCV, getACVRCVExplanation } from '@/lib/insurance/acv-rcv-calculator';

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
    const { rcv, depreciation, depreciationPercent, deductible } = body;

    // Get claim
    const { data: claim, error: claimError } = await serviceSupabase
      .from('insurance_claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    // Use provided values or claim values
    const financials = {
      rcv: rcv || claim.rcv || 0,
      depreciation: depreciation || claim.depreciation || 0,
      depreciationPercent: depreciationPercent || undefined,
      deductible: deductible !== undefined ? deductible : (claim.deductible || 0),
    };

    // Calculate ACV/RCV
    const calculation = calculateACVRCV(financials);

    // Update claim with calculated values
    await serviceSupabase
      .from('insurance_claims')
      .update({
        rcv: calculation.rcv,
        depreciation: calculation.depreciation,
        acv: calculation.acv,
        deductible: calculation.deductible,
        total_claim_value: calculation.rcv,
      })
      .eq('id', claimId);

    const explanation = getACVRCVExplanation(calculation);

    return NextResponse.json({
      calculation,
      explanation,
    });
  } catch (error: any) {
    console.error('Error calculating ACV/RCV:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















