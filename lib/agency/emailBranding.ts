import { getCompanyWhiteLabelSettings, applyEmailBranding, getEmailFromName, getEmailFromAddress } from "./whiteLabel";

/**
 * Apply white-label branding to email before sending
 * This should be called in email sending functions
 */
export async function applyAgencyEmailBranding(
  companyId: string,
  emailBody: string,
  options: {
    fromName?: string;
    fromAddress?: string;
  } = {}
): Promise<{
  body: string;
  fromName: string;
  fromAddress: string;
}> {
  const settings = await getCompanyWhiteLabelSettings(companyId);

  return {
    body: applyEmailBranding(emailBody, settings),
    fromName: options.fromName || getEmailFromName(settings),
    fromAddress: options.fromAddress || getEmailFromAddress(settings),
  };
}

/**
 * Helper for email sending functions to use white-label branding
 * Example usage:
 * 
 * const branded = await applyAgencyEmailBranding(companyId, emailBody);
 * await sendEmail({
 *   to: recipient,
 *   from: branded.fromAddress,
 *   fromName: branded.fromName,
 *   body: branded.body,
 * });
 */
export { applyEmailBranding, getEmailFromName, getEmailFromAddress };



























