// lib/email/composeBody.ts
// Helper to compose final email body with CTA footer for roofing companies

type LeadContext = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
};

type ProfileSettings = {
  company_name?: string | null;
  default_city?: string | null;
  booking_url?: string | null;
  phone?: string | null;
  email_signature?: string | null;
};

function resolveName(lead: LeadContext): string {
  if (lead.name && lead.name.trim().length > 0) return lead.name;
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "there";
}

function resolveCity(lead: LeadContext, profile: ProfileSettings): string {
  return (
    (lead.city && lead.city.trim().length > 0
      ? lead.city
      : profile.default_city) || ""
  );
}

export function renderEmailBody(
  templateBody: string,
  lead: LeadContext,
  profile: ProfileSettings
): string {
  const name = resolveName(lead);
  const city = resolveCity(lead, profile);
  const company = profile.company_name || "our roofing team";

  let rendered = templateBody
    .replace(/{{\s*name\s*}}/gi, name)
    .replace(/{{\s*city\s*}}/gi, city)
    .replace(/{{\s*company\s*}}/gi, company);

  // Basic spacing normalization
  rendered = rendered.trim() + "\n\n";

  // Build CTA footer
  const parts: string[] = [];

  if (profile.company_name) {
    parts.push(`— ${profile.company_name}`);
  }

  if (profile.phone) {
    parts.push(`Call or text: ${profile.phone}`);
  }

  if (profile.booking_url) {
    parts.push(`Book a free roof inspection: ${profile.booking_url}`);
  }

  if (profile.email_signature) {
    parts.push(profile.email_signature);
  }

  const footer = parts.join("\n");

  if (footer.trim().length > 0) {
    rendered += footer + "\n";
  }

  return rendered;
}

























































