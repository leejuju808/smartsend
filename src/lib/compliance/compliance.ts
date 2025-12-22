/**
 * Compliance Layer v1 - TypeScript utilities
 * GDPR • CAN-SPAM • CASL • Global Suppression Enforcement
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export interface ComplianceCheckResult {
  allowed: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ComplianceFooter {
  text: string;
  unsubscribeLink: string;
  physicalAddress: string;
}

/**
 * Pre-send compliance check
 */
export async function checkComplianceBeforeSend(
  workspaceId: string,
  leadId: string,
  emailBody?: string,
  hasUnsubscribeLink?: boolean
): Promise<ComplianceCheckResult> {
  const { data, error } = await supabaseAdmin.rpc('pre_send_compliance_check', {
    p_workspace_id: workspaceId,
    p_lead_id: leadId,
    p_email_body: emailBody || null,
    p_has_unsubscribe_link: hasUnsubscribeLink || false,
  });

  if (error) {
    return {
      allowed: false,
      errors: [error.message || 'Compliance check failed'],
    };
  }

  return data as ComplianceCheckResult;
}

/**
 * GDPR erasure workflow
 */
export async function gdprEraseLead(
  workspaceId: string,
  leadId: string,
  actorId?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin.rpc('gdpr_erase_lead', {
    p_workspace_id: workspaceId,
    p_lead_id: leadId,
    p_actor_id: actorId || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return { success: true };
}

/**
 * Record express consent (CASL)
 */
export async function recordExpressConsent(
  workspaceId: string,
  leadId: string,
  legalBasis: string = 'express_consent'
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin.rpc('record_express_consent', {
    p_workspace_id: workspaceId,
    p_lead_id: leadId,
    p_legal_basis: legalBasis,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return { success: true };
}

/**
 * Check CASL consent requirement
 */
export async function checkCaslConsent(
  workspaceId: string,
  leadId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_casl_consent', {
    p_workspace_id: workspaceId,
    p_lead_id: leadId,
  });

  if (error) {
    console.error('CASL consent check error:', error);
    return false;
  }

  return data === true;
}

/**
 * Generate compliance footer
 */
export async function generateComplianceFooter(
  workspaceId: string,
  unsubscribeLink: string,
  senderCompany?: string
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('generate_compliance_footer', {
    p_workspace_id: workspaceId,
    p_unsubscribe_link: unsubscribeLink,
    p_sender_company: senderCompany || null,
  });

  if (error) {
    console.error('Footer generation error:', error);
    return '';
  }

  return data || '';
}

/**
 * Inject compliance footer into email body
 */
export async function injectComplianceFooter(
  workspaceId: string,
  emailBody: string,
  unsubscribeLink: string,
  senderCompany?: string
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('inject_compliance_footer', {
    p_workspace_id: workspaceId,
    p_email_body: emailBody,
    p_unsubscribe_link: unsubscribeLink,
    p_sender_company: senderCompany || null,
  });

  if (error) {
    console.error('Footer injection error:', error);
    return emailBody; // Return original body on error
  }

  return data || emailBody;
}

/**
 * Export lead data for GDPR request
 */
export async function exportLeadData(
  workspaceId: string,
  leadId: string
): Promise<{ data: any; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc('export_lead_data', {
    p_workspace_id: workspaceId,
    p_lead_id: leadId,
  });

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  return { data };
}

/**
 * Get workspace compliance health score
 */
export async function getComplianceHealthScore(
  workspaceId: string
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('calculate_compliance_health', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    console.error('Health score calculation error:', error);
    return 0;
  }

  return data || 0;
}

/**
 * Update compliance health score
 */
export async function updateComplianceHealthScore(
  workspaceId: string
): Promise<void> {
  await supabaseAdmin.rpc('update_compliance_health_score', {
    p_workspace_id: workspaceId,
  });
}

/**
 * Apply data retention rules
 */
export async function applyDataRetention(
  workspaceId: string
): Promise<{ expiredCount: number; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc('apply_data_retention', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    return {
      expiredCount: 0,
      error: error.message,
    };
  }

  return { expiredCount: data || 0 };
}

/**
 * Get compliance summary for workspace
 */
export async function getComplianceSummary(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from('v_compliance_summary')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  if (error) {
    console.error('Compliance summary error:', error);
    return null;
  }

  return data;
}



