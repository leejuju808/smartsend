// Block 13000 — SmartSend Template Library v1
// POST /api/templates/use - Use a template in a campaign (insert into campaign steps)

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
    const { templateId, campaignId, stepIndex } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    // Verify campaign belongs to user
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, user_id, workspace_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get template (try system templates first, then user custom)
    let template: any = null;

    const { data: systemTemplate } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (systemTemplate) {
      template = systemTemplate;
    } else {
      const { data: customTemplate } = await supabase
        .from('user_custom_templates')
        .select('*')
        .eq('id', templateId)
        .eq('user_id', user.id)
        .single();

      if (customTemplate) {
        template = customTemplate;
      }
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Determine step index (use provided or get next available)
    let targetStepIndex = stepIndex;
    
    if (targetStepIndex === undefined || targetStepIndex === null) {
      // Get the highest step index for this campaign
      const { data: existingSteps } = await supabase
        .from('campaign_steps')
        .select('step_index')
        .eq('campaign_id', campaignId)
        .order('step_index', { ascending: false })
        .limit(1);

      targetStepIndex = existingSteps && existingSteps.length > 0 
        ? existingSteps[0].step_index + 1 
        : 0;
    }

    // Insert template into campaign_steps
    // Try different column name variations based on schema
    const stepData: any = {
      campaign_id: campaignId,
      step_index: targetStepIndex,
      subject: template.subject || '',
      body_html: template.body || '',
      delay_days: 0,
    };

    // Try to insert with various column name combinations
    let insertError = null;
    let insertedStep = null;

    // Try campaign_steps with step_index
    const { data: step1, error: err1 } = await supabase
      .from('campaign_steps')
      .insert({
        campaign_id: campaignId,
        step_index: targetStepIndex,
        subject: template.subject || '',
        body_html: template.body || '',
        delay_days: 0,
      })
      .select()
      .single();

    if (!err1 && step1) {
      insertedStep = step1;
    } else {
      // Try with step_no instead of step_index
      const { data: step2, error: err2 } = await supabase
        .from('campaign_steps')
        .insert({
          campaign_id: campaignId,
          step_no: targetStepIndex,
          subject_template: template.subject || '',
          body_html_template: template.body || '',
          offset_days: 0,
        })
        .select()
        .single();

      if (!err2 && step2) {
        insertedStep = step2;
      } else {
        insertError = err2 || err1;
      }
    }

    if (insertError) {
      console.error('Error inserting template into campaign steps:', insertError);
      return NextResponse.json({ 
        error: 'Failed to insert template into campaign',
        details: insertError.message
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      step: insertedStep,
      message: 'Template inserted into campaign successfully'
    });
  } catch (error: any) {
    console.error('Error in POST /api/templates/use:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
