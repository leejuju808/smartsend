// lib/renderTemplate.ts
// Template rendering for campaign steps using workspace profile + contact fields
// Block 15400: Added {{opener}} token support for AI personalization

type TemplateContext = {
  contact: {
    first_name?: string | null;
    last_name?: string | null;
    city?: string | null;
  };
  workspaceProfile: {
    company_name?: string | null;
    primary_city?: string | null;
  };
  opener?: string | null; // Block 15400: AI-generated personalized opener
};

export function renderTemplateString(
  template: string,
  ctx: TemplateContext
): string {
  let out = template;

  const firstName =
    ctx.contact.first_name?.trim() ||
    ctx.contact.last_name?.trim() ||
    "there";

  const city =
    ctx.contact.city?.trim() ||
    ctx.workspaceProfile.primary_city?.trim() ||
    "";

  const company =
    ctx.workspaceProfile.company_name?.trim() || "our roofing team";

  // Block 15400: Replace {{opener}} token with AI-generated opener or fallback
  const opener = ctx.opener?.trim() || `Hope you've been doing well${city ? ` in ${city}` : ""}.`;
  out = out.replace(/{{\s*opener\s*}}/gi, opener);

  // Replace tokens (case-insensitive, with optional whitespace)
  out = out.replace(/{{\s*first_name\s*}}/gi, firstName);
  out = out.replace(/{{\s*city\s*}}/gi, city);
  out = out.replace(/{{\s*company_name\s*}}/gi, company);

  return out;
}

