/**
 * Block 20560 — Send Proposal Email
 * 
 * POST /api/inbox/proposals/[id]/email/send
 * Sends the proposal email to the homeowner
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateProposalEmail } from '@/lib/ai/proposalEmailGenerator';
import { providerSend } from '@/lib/providers';
import { providerSendResend } from '@/lib/providers/resend';

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

    // Block 20840: Check permission to send proposals
    const { data: canSend, error: permError } = await supabase.rpc(
      "can_send_proposal",
      { p_thread_id: proposal.thread_id }
    );

    if (permError || !canSend) {
      return NextResponse.json(
        { error: "You don't have permission to send proposals. Only owners and assigned sales reps can send proposals." },
        { status: 403 }
      );
    }

    // Check if email was already sent (prevent duplicates)
    const { data: existingSend } = await supabase
      .from('proposal_email_sends')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSend && !body.force_resend) {
      return NextResponse.json(
        { error: 'Proposal email already sent. Use force_resend=true to send again.' },
        { status: 400 }
      );
    }

    // Get contractor settings
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

    // Determine trigger source
    let triggerSource: 'manual_button' | 'homeowner_request_detected' | 'claim_approval_auto' | 'hot_lead_auto' = 'manual_button';
    
    if (body.trigger_source) {
      triggerSource = body.trigger_source;
    } else {
      // Auto-detect trigger source
      const { data: shouldAuto } = await supabase.rpc('should_auto_send_proposal', {
        p_thread_id: proposal.thread_id,
      });
      
      if (shouldAuto) {
        // Check which trigger applies
        const { data: hasRequest } = await supabase.rpc('detect_proposal_request_in_thread', {
          p_thread_id: proposal.thread_id,
        });
        
        if (hasRequest) {
          triggerSource = 'homeowner_request_detected';
        } else if (thread?.insurance_claim_status === 'approved') {
          triggerSource = 'claim_approval_auto';
        } else if (thread?.hot_lead_tier === 1) {
          triggerSource = 'hot_lead_auto';
        }
      }
    }

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

    // Create email send record
    const { data: emailSend, error: emailSendError } = await supabase
      .from('proposal_email_sends')
      .insert({
        proposal_id: proposalId,
        thread_id: proposal.thread_id,
        contact_id: contact?.id || null,
        workspace_id: proposal.workspace_id,
        to_email: emailInput.contactEmail,
        to_name: emailInput.contactName,
        subject: emailOutput.subject,
        html_body: emailOutput.htmlBody,
        text_body: emailOutput.textBody,
        status: 'queued',
        trigger_source: triggerSource,
        metadata: {
          generated_at: new Date().toISOString(),
          proposal_data: proposal.proposal_data,
        },
      })
      .select()
      .single();

    if (emailSendError) {
      console.error('[Send Proposal Email] Error creating send record:', emailSendError);
      return NextResponse.json(
        { error: 'Failed to create email send record' },
        { status: 500 }
      );
    }

    // Get email account/provider settings
    const { data: emailAccount } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('workspace_id', proposal.workspace_id)
      .eq('provider', 'gmail')
      .single();

    // Send email via provider
    let sendResult;
    try {
      if (emailAccount) {
        // Use connected account
        sendResult = await providerSend(emailAccount, {
          to: emailInput.contactEmail,
          subject: emailOutput.subject,
          html: emailOutput.htmlBody,
          text: emailOutput.textBody,
          from: emailAccount.email_address || user.email || 'noreply@smartsend.ai',
        });
      } else {
        // Use default Resend provider
        sendResult = await providerSendResend({
          to: emailInput.contactEmail,
          subject: emailOutput.subject,
          html: emailOutput.htmlBody,
          text: emailOutput.textBody,
          from: contractorSettings?.company_email || user.email || 'noreply@smartsend.ai',
        });
      }

      if (!sendResult.ok) {
        throw new Error(sendResult.error || 'Failed to send email');
      }

      // Update email send record with success
      await supabase
        .from('proposal_email_sends')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: sendResult.messageId || null,
        })
        .eq('id', emailSend.id);

      // Update proposal status
      await supabase
        .from('proposals')
        .update({
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      // Create outbound message in inbox_messages for tracking
      await supabase.from('inbox_messages').insert({
        thread_id: proposal.thread_id,
        campaign_id: proposal.campaign_id,
        lead_id: thread?.lead_id || null,
        direction: 'out',
        sender_email: contractorSettings?.company_email || user.email,
        receiver_email: emailInput.contactEmail,
        subject: emailOutput.subject,
        body: emailOutput.textBody,
        sent_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        email_send_id: emailSend.id,
        message_id: sendResult.messageId,
        sent_at: new Date().toISOString(),
      });
    } catch (sendError: any) {
      console.error('[Send Proposal Email] Error sending email:', sendError);

      // Update email send record with failure
      await supabase
        .from('proposal_email_sends')
        .update({
          status: 'failed',
          error_message: sendError.message || 'Unknown error',
        })
        .eq('id', emailSend.id);

      return NextResponse.json(
        { error: sendError.message || 'Failed to send email' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Send Proposal Email] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send proposal email' },
      { status: 500 }
    );
  }
}

