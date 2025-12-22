export type Vars = Record<string, any>;

export function renderTemplate(tmpl: string | undefined | null, vars: Vars): string {
  if (!tmpl) return '';
  return tmpl.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const parts = String(key).split('.');
    let val: any = vars;
    for (const p of parts) val = val?.[p];
    return (val ?? '').toString();
  });
} 