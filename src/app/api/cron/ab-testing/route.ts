/**
 * Block 24020 — SmartSend Roofing A/B Testing Engine v1
 * Automatic A/B test trigger and execution cron job
 * Runs every hour to check campaigns and trigger/complete tests
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const key = authHeader?.replace('Bearer ', '') || req.nextUrl.searchParams.get('key');
  return key && key === cronSecret;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = {
      testsTriggered: 0,
      testsCompleted: 0,
      winnersApplied: 0,
      errors: [] as string[],
    };

    // 1. Check campaigns that should auto-test
    const { data: allCampaigns } = await supabaseAdmin
      .from('campaigns')
      .select('id, name, title, workspace_id, status, created_at')
      .in('status', ['running', 'active'])
      .limit(100);

    for (const campaign of allCampaigns || []) {
      try {
        // Check if should test using SQL function
        const { data: shouldTest } = await supabaseAdmin.rpc('should_auto_test_ab', {
          p_campaign_id: campaign.id,
        });

        if (shouldTest && !campaignsError) {
          // Check if test already exists
          const { data: existingTest } = await supabaseAdmin
            .from('ab_tests')
            .select('id')
            .eq('campaign_id', campaign.id)
            .eq('status', 'running')
            .maybeSingle();

          if (!existingTest) {
            // Create A/B test (default to subject_line)
            const { data: testId, error: testError } = await supabaseAdmin.rpc('create_auto_ab_test', {
              p_campaign_id: campaign.id,
              p_test_type: 'subject_line',
            });

            if (testError) {
              console.error(`Error creating test for campaign ${campaign.id}:`, testError);
              results.errors.push(`Campaign ${campaign.id}: ${testError.message}`);
            } else {
              results.testsTriggered++;
              console.log(`Created A/B test ${testId} for campaign ${campaign.id}`);
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
        results.errors.push(`Campaign ${campaign.id}: ${error.message}`);
      }
    }

    // 2. Check running tests and see if they're ready to complete
    const { data: runningTests } = await supabaseAdmin
      .from('ab_tests')
      .select('id, campaign_id, min_sample_size')
      .eq('status', 'running')
      .limit(50);

    for (const test of runningTests || []) {
      try {
        // Check if test has enough samples
        const { data: variants } = await supabaseAdmin
          .from('ab_test_variants')
          .select('emails_sent')
          .eq('ab_test_id', test.id);

        const hasEnoughSamples =
          variants &&
          variants.length === 2 &&
          variants.every((v) => v.emails_sent >= test.min_sample_size);

        if (hasEnoughSamples) {
          // Declare winner
          const { data: winnerId, error: winnerError } = await supabaseAdmin.rpc('check_ab_test_winner', {
            p_test_id: test.id,
          });

          if (winnerError) {
            console.error(`Error declaring winner for test ${test.id}:`, winnerError);
            results.errors.push(`Test ${test.id}: ${winnerError.message}`);
          } else if (winnerId) {
            results.testsCompleted++;
            console.log(`Test ${test.id} completed, winner: ${winnerId}`);

            // Apply winner to remaining campaign recipients
            await applyWinnerToCampaign(test.campaign_id, winnerId);
            results.winnersApplied++;
          }
        }
      } catch (error: any) {
        console.error(`Error checking test ${test.id}:`, error);
        results.errors.push(`Test ${test.id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error: any) {
    console.error('A/B testing cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Apply winning variant to remaining campaign recipients
 */
async function applyWinnerToCampaign(campaignId: string, winnerVariantId: string) {
  try {
    // Get winner variant details
    const { data: winner } = await supabaseAdmin
      .from('ab_test_variants')
      .select('*')
      .eq('id', winnerVariantId)
      .single();

    if (!winner) {
      throw new Error('Winner variant not found');
    }

    // Get test details
    const { data: test } = await supabaseAdmin
      .from('ab_tests')
      .select('test_type')
      .eq('id', winner.ab_test_id)
      .single();

    if (!test) {
      throw new Error('Test not found');
    }

    // Get recipients who already got a variant (test group)
    const { data: testRecipients } = await supabaseAdmin
      .from('ab_test_recipients')
      .select('lead_id')
      .eq('ab_test_id', winner.ab_test_id);

    const testLeadIds = (testRecipients || []).map((r) => r.lead_id).filter(Boolean);

    // Get remaining campaign recipients (not in test group)
    const { data: remainingLeads } = await supabaseAdmin
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', campaignId)
      .not('lead_id', 'in', `(${testLeadIds.map((id) => `'${id}'`).join(',')})`);

    if (!remainingLeads || remainingLeads.length === 0) {
      console.log(`No remaining leads for campaign ${campaignId}`);
      return;
    }

    // Get campaign details
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('subject, body_template, body_html')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update send_queue entries for remaining leads with winner variant
    // This depends on your send_queue structure - adjust as needed
    const remainingLeadIds = remainingLeads.map((l) => l.lead_id);

    // For subject line tests, update subject in send_queue
    if (test.test_type === 'subject_line' && winner.subject_line) {
      await supabaseAdmin
        .from('send_queue')
        .update({
          subject: winner.subject_line,
        })
        .eq('campaign_id', campaignId)
        .in('lead_id', remainingLeadIds)
        .eq('status', 'queued');
    }

    // For other test types, you'd update the corresponding fields
    // This is a simplified version - you may need to adjust based on your schema

    console.log(`Applied winner variant to ${remainingLeadIds.length} remaining recipients`);
  } catch (error: any) {
    console.error(`Error applying winner to campaign ${campaignId}:`, error);
    throw error;
  }
}

