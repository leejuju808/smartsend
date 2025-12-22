export function renderTemplate(tmpl: string, lead: any) {
  return tmpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key) => {
    const parts = key.split(".");
    let val: any = lead;
    for (const p of parts) { 
      if (val && typeof val === 'object') {
        val = val[p];
      } else {
        val = undefined;
      }
    }
    return (val ?? "").toString();
  });
}
