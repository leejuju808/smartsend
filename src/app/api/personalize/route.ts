// Block 10400 — Smart Personalization Engine v1
// API endpoint for generating personalized content

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePersonalization, PersonalizationRequest, PersonalizationResult } from '@/lib/personalization/engine';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, stepId, campaignId } = body;

    if (!contactId || !stepId) {
      return NextResponse.json(
        { error: 'contactId and stepId are required' },
        { status: 400 }
      );
    }

    // Check cache first
    const { data: cached } = await supabaseAdmin
      .from('personalization_cache')
      .select('opener, local_reference, roof_context')
      .eq('contact_id', contactId)
      .eq('step_id', stepId)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({
        opener: cached.opener,
        local_reference: cached.local_reference,
        roof_context: cached.roof_context,
      });
    }

    // Get contact data
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('first_name, tags, attrs')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Get campaign/step data for campaign type
    let campaignType: PersonalizationRequest['campaignType'] = 'general';
    if (campaignId) {
      const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('name, type')
        .eq('id', campaignId)
        .maybeSingle();
      
      if (campaign?.type) {
        const type = campaign.type.toLowerCase();
        if (['hail', 'storm', 'inspection', 'insurance'].includes(type)) {
          campaignType = type as PersonalizationRequest['campaignType'];
        }
      }
    }

    // Get user's personalization settings
    let tone: 'friendly' | 'direct' | 'professional' = 'direct';
    if (campaignId) {
      const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('workspace_id')
        .eq('id', campaignId)
        .maybeSingle();
      
      if (campaign?.workspace_id) {
        // Get workspace owner's settings
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('workspace_id', campaign.workspace_id)
          .maybeSingle();
        
        if (profile?.id) {
          const { data: settings } = await supabaseAdmin
            .from('personalization_settings')
            .select('tone, enabled')
            .eq('user_id', profile.id)
            .maybeSingle();
          
          if (settings?.enabled && settings.tone) {
            tone = settings.tone as 'friendly' | 'direct' | 'professional';
          }
        }
      }
    }

    // Build personalization request
    const attrs = (contact.attrs as Record<string, any>) || {};
    const personalizationRequest: PersonalizationRequest = {
      name: contact.first_name || undefined,
      city: attrs.city || undefined,
      state: attrs.state || undefined,
      zip: attrs.zip || undefined,
      tags: contact.tags || [],
      campaignType,
      tone,
    };

    // Generate personalization
    const result = await generatePersonalization(personalizationRequest);

    // Cache the result
    await supabaseAdmin
      .from('personalization_cache')
      .insert({
        contact_id: contactId,
        step_id: stepId,
        campaign_id: campaignId || null,
        opener: result.opener,
        local_reference: result.local_reference,
        roof_context: result.roof_context,
      })
      .catch((err) => {
        // Log but don't fail if cache insert fails
        console.error('Failed to cache personalization:', err);
      });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Personalization API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate personalization' },
      { status: 500 }
    );
  }
}





























































