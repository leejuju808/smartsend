import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getActiveOrg } from '@/lib/org';

/**
 * GET /api/sso/config
 * Get SSO configuration for current org
 */
export async function GET(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: config, error } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('org_id', org.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Don't expose sensitive data
    if (config) {
      const { oauth_client_secret_encrypted, access_token_encrypted, refresh_token_encrypted, ...safeConfig } = config;
      return NextResponse.json({ config: safeConfig });
    }

    return NextResponse.json({ config: null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/sso/config
 * Create or update SSO configuration
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const body = await req.json();
    const {
      provider_type,
      provider_name,
      saml_entity_id,
      saml_sso_url,
      saml_certificate,
      saml_name_id_format,
      oauth_client_id,
      oauth_client_secret_encrypted,
      oauth_authorization_url,
      oauth_token_url,
      oauth_userinfo_url,
      attribute_mapping,
      enabled,
      test_mode,
    } = body;

    const supabase = createAdminClient();

    // In production, encrypt sensitive data properly
    const { data: config, error } = await supabase
      .from('sso_configurations')
      .upsert(
        {
          org_id: org.id,
          provider_type,
          provider_name,
          saml_entity_id,
          saml_sso_url,
          saml_certificate,
          saml_name_id_format,
          oauth_client_id,
          oauth_client_secret_encrypted,
          oauth_authorization_url,
          oauth_token_url,
          oauth_userinfo_url,
          attribute_mapping: attribute_mapping || {},
          enabled: enabled || false,
          test_mode: test_mode !== false,
        },
        {
          onConflict: 'org_id',
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return safe config
    const { oauth_client_secret_encrypted: _, access_token_encrypted: __, refresh_token_encrypted: ___, ...safeConfig } = config;

    return NextResponse.json({ config: safeConfig }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

