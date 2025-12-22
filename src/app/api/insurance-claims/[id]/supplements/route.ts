// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Supplement Management
// GET /api/insurance-claims/[id]/supplements - List supplements
// POST /api/insurance-claims/[id]/supplements - Create supplement

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
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

    const { data: supplements, error } = await serviceSupabase
      .from('supplement_items')
      .select('*')
      .eq('claim_id', claimId)
      .order('supplement_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching supplements:', error);
      return NextResponse.json(
        { error: 'Failed to fetch supplements' },
        { status: 500 }
      );
    }

    // Group by supplement number
    const grouped: Record<number, typeof supplements> = {};
    supplements?.forEach((item) => {
      if (!grouped[item.supplement_number]) {
        grouped[item.supplement_number] = [];
      }
      grouped[item.supplement_number].push(item);
    });

    // Calculate totals per supplement
    const supplementGroups = Object.entries(grouped).map(([num, items]) => {
      const total = items.reduce((sum, item) => sum + (item.cost * (item.quantity || 1)), 0);
      return {
        supplement_number: parseInt(num),
        items,
        total,
        status: items[0]?.status || 'pending',
      };
    });

    return NextResponse.json({ supplements: supplementGroups });
  } catch (error: any) {
    console.error('Error in GET /api/insurance-claims/[id]/supplements:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const { items, supplement_number } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'items array is required' },
        { status: 400 }
      );
    }

    // Get or generate supplement number
    let supplementNum = supplement_number;
    if (!supplementNum) {
      const { data: maxSupplement } = await serviceSupabase
        .rpc('generate_supplement_number', { p_claim_id: claimId });

      supplementNum = maxSupplement || 1;
    }

    // Insert supplement items
    const supplementItems = items.map((item: any) => ({
      claim_id: claimId,
      supplement_number: supplementNum,
      line_item: item.line_item,
      cost: parseFloat(item.cost) || 0,
      quantity: item.quantity ? parseFloat(item.quantity) : 1,
      unit: item.unit || 'EA',
      reason: item.reason || 'Missing from original scope',
      reason_type: item.reason_type || 'scope_missing',
      code_reference: item.code_reference,
      evidence_photo_ids: item.evidence_photo_ids || [],
      notes: item.notes,
      status: 'pending',
    }));

    const { data: created, error } = await serviceSupabase
      .from('supplement_items')
      .insert(supplementItems)
      .select();

    if (error) {
      console.error('Error creating supplements:', error);
      return NextResponse.json(
        { error: 'Failed to create supplements' },
        { status: 500 }
      );
    }

    // Update claim status if needed
    const { data: claim } = await serviceSupabase
      .from('insurance_claims')
      .select('claim_status')
      .eq('id', claimId)
      .single();

    if (claim && claim.claim_status === 'approved') {
      await serviceSupabase
        .from('insurance_claims')
        .update({ claim_status: 'supplement_pending' })
        .eq('id', claimId);
    }

    return NextResponse.json({
      supplements: created,
      supplement_number: supplementNum,
    });
  } catch (error: any) {
    console.error('Error in POST /api/insurance-claims/[id]/supplements:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















