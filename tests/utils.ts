import fs from 'node:fs';
import path from 'node:path';

export function makeCsv(tempDir: string, rows: Array<{ email: string; name?: string; company?: string }>) {
  const header = 'email,name,company\n';
  const body = rows.map(r => `${r.email},${r.name ?? ''},${r.company ?? ''}`).join('\n');
  const csv = header + body + '\n';
  const file = path.join(tempDir, `leads_${Date.now()}.csv`);
  fs.writeFileSync(file, csv, 'utf8');
  return file;
}

