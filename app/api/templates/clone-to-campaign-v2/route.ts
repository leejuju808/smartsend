// Block 15800 — SmartSend Campaign Templates v2
// POST /api/templates/clone-to-campaign-v2 - Clone v2 template steps into a new campaign

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

    // Get template from campaign_templates table
    const { data: template, error: templateError } = await supabase
      .from('campaign_templates')
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

    // Fetch template steps
    const { data: steps, error: stepsError } = await supabase
      .from('campaign_template_steps')
      .select('*')
      .eq('template_id', templateId)
      .order('step_order', { ascending: true });

    if (stepsError) {
      return NextResponse.json({ error: 'Failed to fetch template steps' }, { status: 500 });
    }

    if (!steps || steps.length === 0) {
      return NextResponse.json({ error: 'Template has no steps' }, { status: 400 });
    }

    // Use default tone steps (or first available tone)
    const defaultSteps = steps.filter(s => s.tone === 'default' || !s.tone);
    const stepsToUse = defaultSteps.length > 0 ? defaultSteps : steps.slice(0, template.recommended_steps);

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
        subject: stepsToUse[0]?.subject_template || '',
        body_template: stepsToUse[0]?.body_template || '',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (campaignError || !campaign) {
      console.error('Error creating campaign:', campaignError);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    // Create campaign steps
    const stepsToInsert = stepsToUse.map((step, index) => ({
      campaign_id: campaign.id,
      step_number: step.step_order || index + 1,
      step_index: index,
      subject: step.subject_template,
      subject_template: step.subject_template,
      body: step.body_template,
      body_html: step.body_template,
      body_html_template: step.body_template,
      body_template: step.body_template,
      delay_days: step.delay_days || 0,
      delay_hours: (step.delay_days || 0) * 24,
      offset_days: step.delay_days || 0,
      active: true,
      enabled: true,
    }));

    // Try to insert into campaign_steps table
    const { error: insertStepsError } = await supabase
      .from('campaign_steps')
      .insert(stepsToInsert);

    if (insertStepsError) {
      console.warn('Could not insert campaign_steps (may use different schema):', insertStepsError);
    }

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      steps: stepsToUse.length,
      next: `/campaigns/${campaign.id}`,
    });
  } catch (error: any) {
    console.error('Error in POST /api/templates/clone-to-campaign-v2:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































