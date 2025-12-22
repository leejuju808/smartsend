import { createClient } from "@supabase/supabase-js";

/**
 * Get white-label settings for an agency
 */
export async function getWhiteLabelSettings(agencyId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("white_label_settings")
    .select("*")
    .eq("agency_id", agencyId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get white-label settings for a company (via agency)
 */
export async function getCompanyWhiteLabelSettings(companyId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Get agency for this company
  const { data: agencyCompany } = await supabase
    .from("agency_companies")
    .select("agency_id")
    .eq("company_id", companyId)
    .single();

  if (!agencyCompany) {
    return null;
  }

  return getWhiteLabelSettings(agencyCompany.agency_id);
}

/**
 * Apply white-label branding to email template
 */
export function applyEmailBranding(
  emailBody: string,
  settings: {
    email_logo_url?: string | null;
    email_from_name?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    support_email?: string | null;
  } | null
): string {
  if (!settings) {
    return emailBody;
  }

  let brandedBody = emailBody;

  // Add logo if available
  if (settings.email_logo_url) {
    const logoHtml = `<div style="text-align: center; margin-bottom: 20px;">
      <img src="${settings.email_logo_url}" alt="Logo" style="max-width: 200px; height: auto;" />
    </div>`;
    brandedBody = logoHtml + brandedBody;
  }

  // Add footer with support email
  const footerHtml = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
      ${settings.support_email ? `<p>Need help? Contact us at <a href="mailto:${settings.support_email}" style="color: ${settings.primary_color || '#000'}; text-decoration: none;">${settings.support_email}</a></p>` : ''}
    </div>
  `;
  brandedBody = brandedBody + footerHtml;

  return brandedBody;
}

/**
 * Get email from name for agency
 */
export function getEmailFromName(
  settings: {
    email_from_name?: string | null;
  } | null,
  fallback: string = "SmartSend"
): string {
  return settings?.email_from_name || fallback;
}

/**
 * Get email from address for agency
 */
export function getEmailFromAddress(
  settings: {
    email_from_address?: string | null;
  } | null,
  fallback: string = "noreply@smartsend.ai"
): string {
  return settings?.email_from_address || fallback;
}

/**
 * Apply white-label CSS variables to portal
 */
export function getWhiteLabelCSS(settings: {
  primary_color?: string | null;
  secondary_color?: string | null;
  custom_css?: string | null;
} | null): string {
  if (!settings) {
    return "";
  }

  const cssVars = `
    :root {
      ${settings.primary_color ? `--primary-color: ${settings.primary_color};` : ''}
      ${settings.secondary_color ? `--secondary-color: ${settings.secondary_color};` : ''}
    }
  `;

  const customCSS = settings.custom_css || "";

  return `<style>${cssVars}${customCSS}</style>`;
}



























