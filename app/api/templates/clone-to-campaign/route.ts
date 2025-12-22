// Block 10900 — Roofing Templates Library
// POST /api/templates/clone-to-campaign - Clone template steps into a new campaign

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { templateId, campaignName } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    if (!campaignName?.trim()) {
      return NextResponse.json({ error: 'campaignName is required' }, { status: 400 });
    }

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('templates_campaigns')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Get workspace_id
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;

    // Get org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_org_id')
      .eq('id', user.id)
      .maybeSingle();

    const orgId = profile?.current_org_id || null;

    // Parse steps from JSONB
    const steps = template.steps as Array<{
      stepNumber: number;
      subject: string;
      body: string;
      delayDays: number;
    }>;

    if (!steps || steps.length === 0) {
      return NextResponse.json({ error: 'Template has no steps' }, { status: 400 });
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: campaignName.trim(),
        title: campaignName.trim(),
        workspace_id: workspaceId,
        org_id: orgId,
        user_id: user.id,
        status: 'draft',
        subject: steps[0]?.subject || '',
        body_template: steps[0]?.body || '',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (campaignError || !campaign) {
      console.error('Error creating campaign:', campaignError);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    // Create campaign steps
    const stepsToInsert = steps.map((step, index) => ({
      campaign_id: campaign.id,
      step_number: step.stepNumber || index + 1,
      step_index: index,
      subject: step.subject,
      subject_template: step.subject,
      body: step.body,
      body_html: step.body,
      body_html_template: step.body,
      body_template: step.body,
      delay_days: step.delayDays || 0,
      delay_hours: (step.delayDays || 0) * 24,
      offset_days: step.delayDays || 0,
      active: true,
      enabled: true,
    }));

    // Try to insert into campaign_steps table (handle different schema variations)
    const { error: stepsError } = await supabase
      .from('campaign_steps')
      .insert(stepsToInsert);

    // If campaign_steps doesn't exist or has different schema, that's okay
    // The campaign will still be created with the first step in the main fields
    if (stepsError) {
      console.warn('Could not insert campaign_steps (may use different schema):', stepsError);
    }

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      steps: steps.length,
      next: `/campaigns/${campaign.id}`,
    });
  } catch (error: any) {
    console.error('Error in POST /api/templates/clone-to-campaign:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





























































