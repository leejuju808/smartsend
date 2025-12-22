import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getActiveOrg } from '@/lib/org';

/**
 * GET /api/integrations/enterprise
 * List enterprise integrations for current org
 */
export async function GET(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: integrations, error } = await supabase
      .from('enterprise_integrations')
      .select('id, integration_type, integration_name, status, sync_enabled, last_sync_at, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ integrations: integrations || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/integrations/enterprise
 * Create new enterprise integration
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const body = await req.json();
    const {
      integration_type,
      integration_name,
      config,
      credentials_encrypted,
      access_token_encrypted,
      refresh_token_encrypted,
      expires_at,
      sync_enabled = true,
      sync_frequency = 'realtime',
    } = body;

    const supabase = createAdminClient();

    // Validate integration type
    const validTypes = ['salesforce', 'sap', 'servicenow', 'microsoft_365', 'google_workspace', 'hubspot'];
    if (!validTypes.includes(integration_type)) {
      return NextResponse.json({ error: 'Invalid integration type' }, { status: 400 });
    }

    const { data: integration, error } = await supabase
      .from('enterprise_integrations')
      .insert({
        org_id: org.id,
        integration_type,
        integration_name: integration_name || `${integration_type.charAt(0).toUpperCase() + integration_type.slice(1)} Integration`,
        config: config || {},
        credentials_encrypted,
        access_token_encrypted,
        refresh_token_encrypted,
        expires_at,
        sync_enabled,
        sync_frequency,
        status: 'configuring',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return safe integration (without encrypted fields)
    const { credentials_encrypted: _, access_token_encrypted: __, refresh_token_encrypted: ___, ...safeIntegration } = integration;

    return NextResponse.json({ integration: safeIntegration }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/integrations/enterprise
 * Update enterprise integration
 */
export async function PATCH(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const body = await req.json();
    const { integration_id, ...updates } = body;

    if (!integration_id) {
      return NextResponse.json({ error: 'integration_id required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('enterprise_integrations')
      .select('org_id')
      .eq('id', integration_id)
      .single();

    if (!existing || existing.org_id !== org.id) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const { data: integration, error } = await supabase
      .from('enterprise_integrations')
      .update(updates)
      .eq('id', integration_id)
      .eq('org_id', org.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return safe integration
    const { credentials_encrypted: _, access_token_encrypted: __, refresh_token_encrypted: ___, ...safeIntegration } = integration;

    return NextResponse.json({ integration: safeIntegration });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

