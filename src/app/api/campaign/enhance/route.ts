import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { enhanceCampaign, EnhancementContext } from '@/lib/campaign-enhancer';

/**
 * POST /api/campaign/enhance
 * 
 * Enhances a campaign with AI-powered improvements:
 * - Personalization
 * - Storm intelligence
 * - Insurance optimization
 * - Deliverability cleaning
 * - Tone calibration
 * - CTA optimization
 * - Subject line generation
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      campaignId,
      recipientEmail,
      listType,
      stormData,
      serviceArea,
    } = body;

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    // Load campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns_new')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: campaignError?.message || 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check if enhancement is enabled
    if (campaign.enhancement_enabled === false) {
      return NextResponse.json({
        enhanced_subject: campaign.subject,
        enhanced_body_html: campaign.body_html,
        enhanced_body_text: campaign.body_text,
        enhancement_report: { message: 'Enhancement disabled' },
      });
    }

    // Load recipient data if email provided
    let recipientData;
    if (recipientEmail) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', recipientEmail)
        .eq('user_id', user.id)
        .maybeSingle();

      if (contact) {
        recipientData = {
          email: contact.email,
          name: contact.first_name || contact.last_name ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : undefined,
          city: contact.city,
          state: contact.state,
          zip: contact.zip,
          neighborhood: (contact as any).neighborhood,
          street: (contact as any).street,
          roof_type_guess: contact.roof_type_guess,
          homeowner_likelihood: contact.homeowner_likelihood,
          property_type_guess: contact.property_type_guess,
          storm_risk_level: contact.storm_risk_level,
        };
      }
    }

    // Build enhancement context
    const context: EnhancementContext = {
      campaignId,
      userId: user.id,
      originalSubject: campaign.subject,
      originalBodyHtml: campaign.body_html || '',
      originalBodyText: campaign.body_text || '',
      recipientEmail,
      recipientData,
      listType,
      stormData,
      serviceArea,
    };

    // Run enhancement
    const result = await enhanceCampaign(context);

    // Update campaign with enhanced content (if not per-recipient)
    if (!recipientEmail) {
      await supabase
        .from('campaigns_new')
        .update({
          enhanced_subject: result.enhanced_subject,
          enhanced_body_html: result.enhanced_body_html,
          enhanced_body_text: result.enhanced_body_text,
          enhancement_report: result.enhancement_report,
          enhanced_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('user_id', user.id);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Enhancement error:', error);
    return NextResponse.json(
      { error: error.message || 'Enhancement failed' },
      { status: 500 }
    );
  }
}





















































