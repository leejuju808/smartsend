// Block 9300 — Template Library v1
// POST /api/templates/update - Update a campaign_template (user-editable)

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
    const { id, name, subject, body: bodyText, sequence_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Verify campaign_template belongs to user's campaign
    const { data: campaignTemplate, error: templateError } = await supabase
      .from('campaign_templates')
      .select('campaign_id')
      .eq('id', id)
      .single();

    if (templateError || !campaignTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Check if user owns the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', campaignTemplate.campaign_id)
      .single();

    if (campaignError || !campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (subject !== undefined) updateData.subject = subject;
    if (bodyText !== undefined) updateData.body = bodyText;
    if (sequence_order !== undefined) updateData.sequence_order = sequence_order;

    // Update the template
    const { data: updatedTemplate, error: updateError } = await supabase
      .from('campaign_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating template:', updateError);
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      template: updatedTemplate 
    });
  } catch (error: any) {
    console.error('Error in POST /api/templates/update:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

