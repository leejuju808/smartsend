/**
 * Variable replacement helper for email templates
 * Replaces {{variable}} placeholders with actual values
 */

export function replaceVars(
  body: string,
  lead: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    email?: string | null;
  },
  user: {
    full_name?: string | null;
    email?: string | null;
  },
  workspace: {
    name?: string | null;
  }
): string {
  return body
    .replace(/{{first_name}}/g, lead.first_name || "")
    .replace(/{{last_name}}/g, lead.last_name || "")
    .replace(/{{company}}/g, lead.company || "")
    .replace(/{{email}}/g, lead.email || "")
    .replace(/{{your_name}}/g, user.full_name || user.email || "")
    .replace(/{{your_company}}/g, workspace.name || "");
}










