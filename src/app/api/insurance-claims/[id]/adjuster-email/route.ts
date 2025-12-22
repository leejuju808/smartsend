// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Generate Adjuster Email from Template
// POST /api/insurance-claims/[id]/adjuster-email

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTemplate, renderTemplate } from '@/lib/insurance/adjuster-templates';

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
    const { template_id, custom_variables } = body;

    if (!template_id) {
      return NextResponse.json(
        { error: 'template_id is required' },
        { status: 400 }
      );
    }

    // Get template
    const template = getTemplate(template_id);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Get claim with all data
    const { data: claim, error: claimError } = await serviceSupabase
      .from('insurance_claims')
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address
        ),
        supplement_items (
          id,
          supplement_number,
          line_item,
          cost,
          quantity,
          unit,
          reason,
          reason_type
        ),
        evidence_photos (
          id,
          ai_damage_type,
          ai_findings,
          ai_location
        )
      `)
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    // Build variables from claim data
    const variables: Record<string, string> = {
      claim_number: claim.claim_number,
      adjuster_name: claim.adjuster_name || 'Adjuster',
      homeowner_name: claim.jobs?.homeowner_name || 'Homeowner',
      address: claim.jobs?.address || 'Property Address',
      carrier: claim.carrier,
      loss_date: claim.claim_filed_date || new Date().toISOString().split('T')[0],
      ...custom_variables,
    };

    // Add template-specific variables
    if (template_id === 'supplement_request') {
      const supplements = claim.supplement_items || [];
      const supplementNumber = supplements[0]?.supplement_number || 1;
      const supplementTotal = supplements.reduce(
        (sum: number, item: any) => sum + (item.cost * (item.quantity || 1)),
        0
      );

      variables.supplement_number = supplementNumber.toString();
      variables.supplement_items = supplements
        .map(
          (item: any) =>
            `- ${item.line_item}: ${item.quantity || 1} ${item.unit || 'EA'} @ $${item.cost} = $${(item.cost * (item.quantity || 1)).toFixed(2)}`
        )
        .join('\n');
      variables.supplement_justification = supplements
        .map((item: any) => `- ${item.line_item}: ${item.reason}`)
        .join('\n');
      variables.supplement_total = `$${supplementTotal.toFixed(2)}`;
    }

    // Render template
    const { subject, body: emailBody } = renderTemplate(template, variables);

    // Log communication
    const communicationLog = [
      ...(claim.communication_log || []),
      {
        type: 'email',
        template_id: template_id,
        subject,
        sent_at: new Date().toISOString(),
        sent_by: user.id,
      },
    ];

    await serviceSupabase
      .from('insurance_claims')
      .update({ communication_log })
      .eq('id', claimId);

    return NextResponse.json({
      subject,
      body: emailBody,
      to: claim.adjuster_email,
      template_id,
    });
  } catch (error: any) {
    console.error('Error generating adjuster email:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















