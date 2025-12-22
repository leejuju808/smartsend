// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Scope of Loss Comparison (Missing Items Detector)
// POST /api/insurance-claims/[id]/scope-comparison

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ScopeItem {
  line_item: string;
  quantity?: number;
  unit?: string;
  cost?: number;
  description?: string;
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
    const { adjuster_scope, contractor_scope } = body;

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

    // Use adjuster scope from body or claim
    const adjusterScopeItems: ScopeItem[] = adjuster_scope || claim.approved_scope || [];
    const contractorScopeItems: ScopeItem[] = contractor_scope || claim.contractor_scope || [];

    // AI-powered missing items detection
    const missingItems = await detectMissingItems(
      adjusterScopeItems,
      contractorScopeItems
    );

    // Update claim with missing items
    await serviceSupabase
      .from('insurance_claims')
      .update({
        approved_scope: adjusterScopeItems,
        contractor_scope: contractorScopeItems,
        missing_items: missingItems,
      })
      .eq('id', claimId);

    return NextResponse.json({
      missing_items: missingItems,
      adjuster_scope: adjusterScopeItems,
      contractor_scope: contractorScopeItems,
    });
  } catch (error: any) {
    console.error('Error in scope comparison:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function detectMissingItems(
  adjusterScope: ScopeItem[],
  contractorScope: ScopeItem[]
): Promise<any[]> {
  if (!process.env.OPENAI_API_KEY) {
    // Fallback: simple comparison
    return simpleScopeComparison(adjusterScope, contractorScope);
  }

  try {
    const systemPrompt = `You are SmartSend Scope Comparison AI - an expert at comparing roofing scopes and identifying missing items.

Compare the adjuster's approved scope with the contractor's scope and identify:
1. Items in contractor scope that are MISSING from adjuster scope
2. Code-required items that are typically missing (drip edge, ice & water shield, starter strip, etc.)
3. Items that are under-quantified in adjuster scope

Common missing items in insurance scopes:
- Drip Edge (required by code in most areas)
- Ice & Water Shield (required in valleys and eaves)
- Starter Strip (required at eaves)
- Ridge Vent System (if replacing ridge)
- High-Profile Ridge (if architectural shingles)
- Underlayment upgrades
- Flashing upgrades
- Code-required materials

Return ONLY valid JSON array of missing items in this format:
[
  {
    "line_item": "Drip Edge",
    "reason": "Required by local building code",
    "reason_type": "code_required",
    "estimated_cost": 320,
    "estimated_quantity": 120,
    "unit": "LF",
    "code_reference": "IRC R905.2.8.5",
    "priority": "high"
  }
]

Be specific and accurate. Only include items that are genuinely missing or under-quantified.`;

    const adjusterScopeText = JSON.stringify(adjusterScope, null, 2);
    const contractorScopeText = JSON.stringify(contractorScope, null, 2);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Adjuster Scope:
${adjusterScopeText}

Contractor Scope:
${contractorScopeText}

Identify missing items. Return ONLY valid JSON array.`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return simpleScopeComparison(adjusterScope, contractorScope);
    }

    const parsed = JSON.parse(content);
    // Handle both array and object with array property
    const missingItems = Array.isArray(parsed) ? parsed : parsed.missing_items || parsed.items || [];

    return missingItems;
  } catch (error) {
    console.error('Error in AI scope comparison:', error);
    return simpleScopeComparison(adjusterScope, contractorScope);
  }
}

function simpleScopeComparison(
  adjusterScope: ScopeItem[],
  contractorScope: ScopeItem[]
): any[] {
  const adjusterItems = new Set(
    adjusterScope.map((item) => item.line_item.toLowerCase().trim())
  );

  const missing: any[] = [];

  contractorScope.forEach((item) => {
    const itemName = item.line_item.toLowerCase().trim();
    if (!adjusterItems.has(itemName)) {
      missing.push({
        line_item: item.line_item,
        reason: 'Missing from adjuster scope',
        reason_type: 'scope_missing',
        estimated_cost: item.cost || 0,
        estimated_quantity: item.quantity || 1,
        unit: item.unit || 'EA',
        priority: 'normal',
      });
    }
  });

  return missing;
}





















