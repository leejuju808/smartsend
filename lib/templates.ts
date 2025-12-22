export type Vars = {
  lead?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    email?: string;
    title?: string;
  };
  me?: {
    name?: string;
    company?: string;
    title?: string;
    email?: string;
  };
  campaign?: {
    name?: string;
    offer?: string;
  };
};

export function renderTemplate(input: string, vars: Vars): string {
  const flat: Record<string, string> = {
    "lead.name": vars.lead?.name ?? "",
    "lead.first_name":
      vars.lead?.first_name ?? (vars.lead?.name?.split(" ")[0] ?? ""),
    "lead.last_name":
      vars.lead?.last_name ??
      (vars.lead?.name?.split(" ").slice(1).join(" ") ?? ""),
    "lead.company": vars.lead?.company ?? "",
    "lead.email": vars.lead?.email ?? "",
    "lead.title": vars.lead?.title ?? "",
    "me.name": vars.me?.name ?? "",
    "me.company": vars.me?.company ?? "",
    "me.title": vars.me?.title ?? "",
    "me.email": vars.me?.email ?? "",
    "campaign.name": vars.campaign?.name ?? "",
    "campaign.offer": vars.campaign?.offer ?? "",
    today: new Date().toLocaleDateString(),
  };

  return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key) => {
    return flat[key] ?? "";
  });
}




