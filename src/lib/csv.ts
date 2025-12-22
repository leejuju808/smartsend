export type ParsedRow = Record<string, string>;

export async function parseCsvFile(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const Papa = (await import("papaparse")).default as any;
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const rows = (results.data || []) as ParsedRow[];
        const headers = results.meta?.fields ?? Object.keys(rows[0] ?? {});
        resolve({ headers, rows });
      },
      error: (err: any) => reject(err),
    });
  });
}

export function buildErrorCsv(errors: Array<Record<string, any>>): string {
  if (!errors?.length) return "";
  const headers = ["row", "email", "reason"];
  const lines = [headers.join(",")];
  for (const e of errors) {
    const vals = [e.row ?? "", e.email ?? "", e.reason ?? ""];
    lines.push(vals.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","));
  }
  return lines.join("\n");
}

/**
 * Convert array of objects to CSV string
 * Handles quoting, escaping, and newlines properly for Excel/Sheets compatibility
 */
export function toCSV(rows: any[]): string {
  if (!rows?.length) return '';

  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const needs = /[",\n]/.test(s);
    return needs ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const head = headers.join(',');
  const body = rows.map(r => headers.map(h => esc((r as any)[h])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}



