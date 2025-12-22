export function findMissingVariables(template: string, leads: any[]) {
  const regex = /{{(.*?)}}/g;
  const matches = template.match(regex) || [];
  const vars = matches.map((v) => v.replace("{{", "").replace("}}", "").trim());

  const missing: string[] = [];

  // Check each variable exists in lead data
  for (const v of vars) {
    const [key, sub] = v.split(".");
    let exists = false;
    for (const lead of leads) {
      if (key === "custom" && sub) {
        // Check both custom_fields and custom (for backward compatibility)
        if (
          (lead.custom_fields && lead.custom_fields[sub] !== undefined) ||
          (lead.custom && lead.custom[sub] !== undefined)
        ) {
          exists = true;
          break;
        }
      } else if (lead[key] !== undefined && lead[key] !== null) {
        exists = true;
        break;
      }
    }
    if (!exists) missing.push(v);
  }

  return missing;
}

