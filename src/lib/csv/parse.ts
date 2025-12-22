// lib/csv/parse.ts
// Handles quoted fields, commas, CRLF, and basic escapes. Not RFC-perfect but reliable.

export function parseCSV(input: string): { headers: string[]; rows: any[] } {
  const lines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitLine(lines[0]);
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = splitLine(lines[i]);
    const obj: any = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = parts[j] ?? "";
    }
    rows.push(obj);
  }

  return { headers, rows };
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

