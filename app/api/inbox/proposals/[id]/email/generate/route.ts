/**
 * Block 20560 — Generate Proposal Email Preview
 * 
 * GET /api/inbox/proposals/[id]/email/generate
 * Generates a preview of the proposal email (does not send)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateProposalEmail } from '@/lib/ai/proposalEmailGenerator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: proposalId } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get proposal with related data
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select(`
        *,
        thread:inbox_threads(
          *,
          contact:contacts(*)
        )
      `)
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    // Get contractor settings
    const { data: contractorSettings } = await supabase
      .from('company_settings')
      .select('*')
      .eq('workspace_id', proposal.workspace_id)
      .single();

    // Get contractor profile for additional info
    const { data: contractorProfile } = await supabase
      .from('contractor_profile')
      .select('*')
      .eq('workspace_id', proposal.workspace_id)
      .single();

    // Get user profile for email signature
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('email_signature, phone, company_name')
      .eq('id', user.id)
      .single();

    const thread = proposal.thread;
    const contact = thread?.contact || thread?.contact_id;

    // Build input for email generator
    const emailInput = {
      proposalData: {
        homeowner_name:
          proposal.proposal_data?.homeowner_name ||
          contact?.name ||
          'Homeowner',
        property_address:
          proposal.proposal_data?.property_address ||
          contact?.address ||
          '',
        project_price:
          proposal.proposal_data?.project_price ||
          proposal.proposal_data?.project_price ||
          0,
        scope_of_work: proposal.proposal_data?.line_items?.map(
          (item: any) => item.description || item.name
        ) || proposal.proposal_data?.scope_of_work || [],
        warranty: proposal.proposal_data?.warranty,
        timeline: proposal.proposal_data?.timeline,
        next_steps: proposal.proposal_data?.next_steps,
      },
      insuranceData: {
        carrier: thread?.insurance_carrier || null,
        deductible: thread?.insurance_deductible_amount || null,
        rcv_total: thread?.claim_financials?.rcv_total || null,
        acv_total: thread?.claim_financials?.acv_total || null,
        depreciation_recoverable:
          thread?.insurance_depreciation_recoverable || null,
        depreciation_amount: thread?.insurance_depreciation_amount || null,
      },
      contractorInfo: {
        company_name:
          contractorSettings?.company_name ||
          contractorProfile?.company_name ||
          userProfile?.company_name ||
          'Your Roofing Company',
        phone:
          contractorSettings?.company_phone ||
          contractorProfile?.company_phone ||
          userProfile?.phone ||
          null,
        email:
          contractorSettings?.company_email ||
          user.email ||
          null,
        signature: userProfile?.email_signature || '',
      },
      contactEmail: contact?.email || thread?.contact_email || '',
      contactName: contact?.name || proposal.proposal_data?.homeowner_name || 'Homeowner',
      city: contact?.city || null,
      state: contact?.state || null,
    };

    // Generate email using AI
    const emailOutput = await generateProposalEmail(emailInput);

    return NextResponse.json({
      email: {
        to: emailInput.contactEmail,
        to_name: emailInput.contactName,
        subject: emailOutput.subject,
        html: emailOutput.htmlBody,
        text: emailOutput.textBody,
      },
      proposal_id: proposalId,
      thread_id: proposal.thread_id,
    });
  } catch (error: any) {
    console.error('[Generate Proposal Email] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate proposal email' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/proposals/[id]/email/generate
 * Same as GET, but allows custom contractor settings override
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: proposalId } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get proposal with related data (same as GET)
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select(`
        *,
        thread:inbox_threads(
          *,
          contact:contacts(*)
        )
      `)
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    // Get contractor settings (same as GET)
    const { data: contractorSettings } = await supabase
      .from('company_settings')
      .select('*')
      .eq('workspace_id', proposal.workspace_id)
      .single();

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('email_signature, phone, company_name')
      .eq('id', user.id)
      .single();

    const thread = proposal.thread;
    const contact = thread?.contact || thread?.contact_id;

    // Build input (allow override from body)
    const emailInput = {
      proposalData: {
        homeowner_name:
          proposal.proposal_data?.homeowner_name ||
          contact?.name ||
          'Homeowner',
        property_address:
          proposal.proposal_data?.property_address ||
          contact?.address ||
          '',
        project_price:
          proposal.proposal_data?.project_price ||
          proposal.proposal_data?.project_price ||
          0,
        scope_of_work: proposal.proposal_data?.line_items?.map(
          (item: any) => item.description || item.name
        ) || proposal.proposal_data?.scope_of_work || [],
        warranty: proposal.proposal_data?.warranty,
        timeline: proposal.proposal_data?.timeline,
        next_steps: proposal.proposal_data?.next_steps,
      },
      insuranceData: {
        carrier: thread?.insurance_carrier || null,
        deductible: thread?.insurance_deductible_amount || null,
        rcv_total: thread?.claim_financials?.rcv_total || null,
        acv_total: thread?.claim_financials?.acv_total || null,
        depreciation_recoverable:
          thread?.insurance_depreciation_recoverable || null,
        depreciation_amount: thread?.insurance_depreciation_amount || null,
      },
      contractorInfo: {
        company_name:
          body.company_name ||
          contractorSettings?.company_name ||
          userProfile?.company_name ||
          'Your Roofing Company',
        phone:
          body.phone ||
          contractorSettings?.company_phone ||
          userProfile?.phone ||
          null,
        email:
          body.email ||
          contractorSettings?.company_email ||
          user.email ||
          null,
        signature: body.email_signature || userProfile?.email_signature || '',
      },
      contactEmail: contact?.email || thread?.contact_email || '',
      contactName: contact?.name || proposal.proposal_data?.homeowner_name || 'Homeowner',
      city: contact?.city || null,
      state: contact?.state || null,
    };

    // Generate email using AI
    const emailOutput = await generateProposalEmail(emailInput);

    return NextResponse.json({
      email: {
        to: emailInput.contactEmail,
        to_name: emailInput.contactName,
        subject: emailOutput.subject,
        html: emailOutput.htmlBody,
        text: emailOutput.textBody,
      },
      proposal_id: proposalId,
      thread_id: proposal.thread_id,
    });
  } catch (error: any) {
    console.error('[Generate Proposal Email] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate proposal email' },
      { status: 500 }
    );
  }
}
















































