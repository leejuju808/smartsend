/**
 * Block 20560 — Auto-Send Proposal Detection
 * 
 * POST /api/inbox/proposals/auto-send
 * Checks for proposals that should be auto-sent and sends them
 * 
 * This endpoint can be called by:
 * - Cron job (check every hour)
 * - Webhook after claim approval
 * - Webhook after hot lead classification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user (optional - can be called by service role)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Get workspace_id filter if provided
    const workspaceId = body.workspace_id || null;
    const threadId = body.thread_id || null;

    // Find proposals that should be auto-sent
    let query = supabase
      .from('proposals')
      .select(`
        id,
        thread_id,
        status,
        thread:inbox_threads(
          id,
          insurance_claim_status,
          insurance_last_updated_at,
          hot_lead_tier,
          hot_lead_score,
          updated_at
        )
      `)
      .in('status', ['generated', 'draft']);

    if (threadId) {
      query = query.eq('thread_id', threadId);
    }

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data: proposals, error: proposalsError } = await query;

    if (proposalsError) {
      throw proposalsError;
    }

    if (!proposals || proposals.length === 0) {
      return NextResponse.json({
        success: true,
        checked: 0,
        sent: 0,
        skipped: 0,
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Check each proposal
    for (const proposal of proposals) {
      try {
        // Check if should auto-send
        const { data: shouldSend, error: checkError } = await supabase.rpc(
          'should_auto_send_proposal',
          {
            p_thread_id: proposal.thread_id,
          }
        );

        if (checkError) {
          errors.push(`Proposal ${proposal.id}: ${checkError.message}`);
          skippedCount++;
          continue;
        }

        if (!shouldSend) {
          skippedCount++;
          continue;
        }

        // Determine trigger source
        const thread = proposal.thread;
        let triggerSource:
          | 'homeowner_request_detected'
          | 'claim_approval_auto'
          | 'hot_lead_auto' = 'hot_lead_auto';

        const { data: hasRequest } = await supabase.rpc(
          'detect_proposal_request_in_thread',
          {
            p_thread_id: proposal.thread_id,
          }
        );

        if (hasRequest) {
          triggerSource = 'homeowner_request_detected';
        } else if (thread?.insurance_claim_status === 'approved') {
          triggerSource = 'claim_approval_auto';
        } else if (thread?.hot_lead_tier === 1) {
          triggerSource = 'hot_lead_auto';
        }

        // Send proposal email via internal API call
        const sendResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/inbox/proposals/${proposal.id}/email/send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: req.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              trigger_source: triggerSource,
            }),
          }
        );

        if (!sendResponse.ok) {
          const errorData = await sendResponse.json().catch(() => ({}));
          errors.push(
            `Proposal ${proposal.id}: ${errorData.error || 'Failed to send'}`
          );
          skippedCount++;
          continue;
        }

        sentCount++;
      } catch (error: any) {
        errors.push(`Proposal ${proposal.id}: ${error.message}`);
        skippedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      checked: proposals.length,
      sent: sentCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Auto-Send Proposals] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check auto-send proposals' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/proposals/auto-send
 * Check which proposals should be auto-sent (dry run)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id');
    const threadId = searchParams.get('thread_id');

    const supabase = createRouteHandlerClient({ cookies });

    // Find proposals that should be auto-sent
    let query = supabase
      .from('proposals')
      .select(`
        id,
        thread_id,
        status,
        thread:inbox_threads(
          id,
          insurance_claim_status,
          insurance_last_updated_at,
          hot_lead_tier,
          hot_lead_score,
          updated_at
        )
      `)
      .in('status', ['generated', 'draft']);

    if (threadId) {
      query = query.eq('thread_id', threadId);
    }

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data: proposals, error: proposalsError } = await query;

    if (proposalsError) {
      throw proposalsError;
    }

    if (!proposals || proposals.length === 0) {
      return NextResponse.json({
        proposals_to_send: [],
        count: 0,
      });
    }

    const proposalsToSend: any[] = [];

    // Check each proposal
    for (const proposal of proposals) {
      const { data: shouldSend } = await supabase.rpc(
        'should_auto_send_proposal',
        {
          p_thread_id: proposal.thread_id,
        }
      );

      if (shouldSend) {
        proposalsToSend.push({
          proposal_id: proposal.id,
          thread_id: proposal.thread_id,
          reason: 'auto_send_eligible',
        });
      }
    }

    return NextResponse.json({
      proposals_to_send: proposalsToSend,
      count: proposalsToSend.length,
    });
  } catch (error: any) {
    console.error('[Auto-Send Proposals Check] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check auto-send proposals' },
      { status: 500 }
    );
  }
}
















































