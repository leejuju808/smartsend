// Lightweight mustache-ish renderer with {{placeholders}} and {{#if field}}...{{/if}}
export function renderTemplate(tpl: string, ctx: Record<string, any>) {
  if (!tpl) return "";

  // conditionals: {{#if field}}...{{/if}}
  tpl = tpl.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_: string, key: string, inner: string) => {
    const val = get(ctx, key);
    return val ? inner : "";
  });

  // variables: {{first_name}}, {{company}}, {{lead.email}} etc.
  tpl = tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, key: string) => {
    const val = get(ctx, key);
    return (val === null || val === undefined) ? "" : String(val);
  });

  return tpl;
}

function get(obj: any, path: string) {
  return path.split(".").reduce((o: any, k: string) => (o ? o[k] : undefined), obj);
}















