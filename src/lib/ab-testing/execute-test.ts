/**
 * Block 24020 — Execute A/B Test
 * Splits campaign recipients into test groups and applies variants
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ExecuteTestParams {
  testId: string;
  campaignId: string;
  testSplitPercent?: number; // 10-20%, default 15%
}

/**
 * Execute A/B test by splitting recipients and applying variants
 * This should be called when enqueueing emails for a campaign that has an active test
 */
export async function executeAbTest(params: ExecuteTestParams): Promise<void> {
  const { testId, campaignId, testSplitPercent = 15 } = params;

  try {
    // Get test details
    const { data: test, error: testError } = await supabaseAdmin
      .from('ab_tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (testError || !test) {
      throw new Error(`Test not found: ${testError?.message}`);
    }

    if (test.status !== 'running') {
      throw new Error(`Test is not running (status: ${test.status})`);
    }

    // Get variants
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from('ab_test_variants')
      .select('*')
      .eq('ab_test_id', testId)
      .order('variant_label');

    if (variantsError || !variants || variants.length !== 2) {
      throw new Error(`Invalid variants: ${variantsError?.message}`);
    }

    const variantA = variants.find((v) => v.variant_label === 'A');
    const variantB = variants.find((v) => v.variant_label === 'B');

    if (!variantA || !variantB) {
      throw new Error('Both variants A and B must exist');
    }

    // Get campaign recipients who haven't been assigned yet
    const { data: recipients } = await supabaseAdmin
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', campaignId);

    if (!recipients || recipients.length === 0) {
      console.log(`No recipients found for campaign ${campaignId}`);
      return;
    }

    // Get already assigned recipients
    const { data: assigned } = await supabaseAdmin
      .from('ab_test_recipients')
      .select('lead_id')
      .eq('ab_test_id', testId);

    const assignedLeadIds = new Set((assigned || []).map((a) => a.lead_id));

    // Filter out already assigned
    const unassignedRecipients = recipients.filter((r) => !assignedLeadIds.has(r.lead_id));

    if (unassignedRecipients.length === 0) {
      console.log(`All recipients already assigned for test ${testId}`);
      return;
    }

    // Calculate split: testSplitPercent% for testing, rest for control (will get winner later)
    const testGroupSize = Math.ceil((unassignedRecipients.length * testSplitPercent) / 100);
    const testGroup = unassignedRecipients.slice(0, testGroupSize);
    const remainingGroup = unassignedRecipients.slice(testGroupSize);

    // Randomly assign test group to variant A or B (50/50 split)
    const variantASize = Math.floor(testGroup.length / 2);
    const variantAGroup = testGroup.slice(0, variantASize);
    const variantBGroup = testGroup.slice(variantASize);

    // Insert test recipients
    const testRecipientsToInsert = [
      ...variantAGroup.map((r) => ({
        ab_test_id: testId,
        variant_id: variantA.id,
        lead_id: r.lead_id,
      })),
      ...variantBGroup.map((r) => ({
        ab_test_id: testId,
        variant_id: variantB.id,
        lead_id: r.lead_id,
      })),
    ];

    if (testRecipientsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('ab_test_recipients')
        .insert(testRecipientsToInsert);

      if (insertError) {
        throw new Error(`Failed to insert test recipients: ${insertError.message}`);
      }

      // Update variant sent counts
      await supabaseAdmin
        .from('ab_test_variants')
        .update({ emails_sent: variantA.emails_sent + variantAGroup.length })
        .eq('id', variantA.id);

      await supabaseAdmin
        .from('ab_test_variants')
        .update({ emails_sent: variantB.emails_sent + variantBGroup.length })
        .eq('id', variantB.id);
    }

    // Update send_queue with variant content for test group
    await applyVariantsToSendQueue({
      campaignId,
      testId,
      variantA,
      variantB,
      variantAGroup: variantAGroup.map((r) => r.lead_id),
      variantBGroup: variantBGroup.map((r) => r.lead_id),
      testType: test.test_type,
    });

    console.log(
      `A/B test executed: ${variantAGroup.length} to variant A, ${variantBGroup.length} to variant B, ${remainingGroup.length} remaining`
    );
  } catch (error: any) {
    console.error(`Error executing A/B test ${testId}:`, error);
    throw error;
  }
}

/**
 * Apply variant content to send_queue entries
 */
async function applyVariantsToSendQueue(params: {
  campaignId: string;
  testId: string;
  variantA: any;
  variantB: any;
  variantAGroup: string[];
  variantBGroup: string[];
  testType: string;
}): Promise<void> {
  const { campaignId, variantA, variantB, variantAGroup, variantBGroup, testType } = params;

  // Get campaign to get base content
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('subject, body_template, body_html')
    .eq('id', campaignId)
    .single();

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Apply variant A
  if (variantAGroup.length > 0) {
    const updateA: any = {};
    if (testType === 'subject_line' && variantA.subject_line) {
      updateA.subject = variantA.subject_line;
    }
    // Add other test types as needed

    if (Object.keys(updateA).length > 0) {
      await supabaseAdmin
        .from('send_queue')
        .update(updateA)
        .eq('campaign_id', campaignId)
        .in('lead_id', variantAGroup)
        .eq('status', 'queued');
    }
  }

  // Apply variant B
  if (variantBGroup.length > 0) {
    const updateB: any = {};
    if (testType === 'subject_line' && variantB.subject_line) {
      updateB.subject = variantB.subject_line;
    }
    // Add other test types as needed

    if (Object.keys(updateB).length > 0) {
      await supabaseAdmin
        .from('send_queue')
        .update(updateB)
        .eq('campaign_id', campaignId)
        .in('lead_id', variantBGroup)
        .eq('status', 'queued');
    }
  }
}

/**
 * Check if campaign has active A/B test
 */
export async function getActiveTestForCampaign(campaignId: string): Promise<string | null> {
  const { data: test } = await supabaseAdmin
    .from('ab_tests')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'running')
    .maybeSingle();

  return test?.id || null;
}






































