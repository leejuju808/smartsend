export type MinimalContact = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
};

function deriveFirst(contact: MinimalContact): string {
  if (contact.name) {
    const parts = String(contact.name).trim().split(/\s+/);
    return parts[0] || "";
  }
  return "";
}

function deriveLast(contact: MinimalContact): string {
  if (contact.name) {
    const parts = String(contact.name).trim().split(/\s+/);
    return parts.slice(1).join(" ");
  }
  return "";
}

export function renderTemplate(template: string, contact: MinimalContact) {
  const first = deriveFirst(contact);
  const last = deriveLast(contact);
  const company = contact.company ? String(contact.company) : "";
  const email = contact.email ? String(contact.email) : "";

  return (template || "")
    // support both {{name}} and {{first}}
    .replace(/{{\s*name\s*}}/gi, first)
    .replace(/{{\s*first\s*}}/gi, first)
    .replace(/{{\s*last\s*}}/gi, last)
    .replace(/{{\s*company\s*}}/gi, company)
    .replace(/{{\s*email\s*}}/gi, email);
}