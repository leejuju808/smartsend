// Template merging utility for cadence variable substitution

export function mergeTemplate(
  body: string,
  vars: Record<string, string | undefined>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

