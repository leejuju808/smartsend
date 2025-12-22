export type RuleNode =
  | { op: "and" | "or"; rules: RuleNode[] }
  | { field: string; op: string; value?: any };

function escLike(v: string) {
  return v.replace(/[%_]/g, s => "\\" + s);
}

export function buildContactsFilter(def: RuleNode) {
  const params: any[] = [];
  function expr(node: RuleNode): string {
    if ("op" in node && (node.op === "and" || node.op === "or") && Array.isArray(node.rules)) {
      const parts = node.rules.map(r => expr(r)).filter(Boolean);
      return parts.length ? `(${parts.join(node.op === "and" ? " AND " : " OR ")})` : "true";
    }
    const f = (node as any).field as string;
    const op = (node as any).op as string;
    const val = (node as any).value;

    const fld = f === "email" || f === "first_name" || f === "last_name" || f === "company"
      ? `co.${f}`
      : f === "domain"
        ? `split_part(lower(co.email),'@',2)`
        : f === "tag"
          ? `co.tags`
          : // Enrichment fields (Block 12400)
          f === "county" || f === "roof_type_guess" || f === "property_type_guess" || 
          f === "storm_risk_level" || f === "homeowner_likelihood"
          ? `co.${f}`
          : f?.startsWith("attr.")
            ? `co.attrs->>${JSON.stringify(f.slice(5)).slice(1,-1)}`
            : null;
    if (!fld) return "true";

    switch (op) {
      case "equals":    params.push(val); return `${fld} = ${place(params.length)}`;
      case "contains":  params.push(`%${escLike(String(val))}%`); return `${fld} ILIKE ${place(params.length)}`;
      case "starts_with": params.push(`${escLike(String(val))}%`); return `${fld} ILIKE ${place(params.length)}`;
      case "ends_with": params.push(`%${escLike(String(val))}`); return `${fld} ILIKE ${place(params.length)}`;
      case "in":        if (!Array.isArray(val) || !val.length) return "false"; params.push(val); return `${fld} = ANY(${place(params.length)})`;
      case "not_in":    if (!Array.isArray(val) || !val.length) return "true"; params.push(val); return `NOT (${fld} = ANY(${place(params.length)}))`;
      case "exists":    return f.startsWith("attr.") ? `co.attrs ? ${sqlLit(f.slice(5))}` : "true";
      case "not_exists":return f.startsWith("attr.") ? `NOT (co.attrs ? ${sqlLit(f.slice(5))})` : "true";
      default:          return "true";
    }
  }
  const where = expr(def) || "true";
  return { where, params };
}

function place(i: number) { return `$${i}`; }
function sqlLit(s: string) { return `'${s.replace(/'/g,"''")}'`; }