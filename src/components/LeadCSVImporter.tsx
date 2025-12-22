'use client';
import { useState } from 'react';
import Papa from 'papaparse';
import { useToast } from "@/components/ui/toast/ToastProvider";

type Mapping = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
};

const REQUIRED = [{ key: 'email', label: 'Email' }] as const;
const OPTIONAL = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Title' },
  { key: 'phone', label: 'Phone' }
] as const;

export function LeadCSVImporter({ campaignId, userId }: { campaignId?: string; userId: string }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { push } = useToast();

  const MAX_ROWS = 10_000;

  async function estimateCsvRows(selected: File): Promise<number> {
    const text = await selected.slice(0, 2_000_000).text();
    return text.split(/\r\n|\n/).filter(Boolean).length - 1; // minus header
  }

  async function onFile(file: File) {
    try {
      const approx = await estimateCsvRows(file);
      if (approx > MAX_ROWS) {
        push({
          type: "error",
          title: "CSV too large",
          description: `Detected ~${approx.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}. Please split the file and try again.`,
        });
        return;
      }
    } catch {}
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: any) => {
        if (res.errors && res.errors.length > 0) {
          const errorMsg = res.errors[0].message || 'Unknown parse error';
          push({ type: "error", title: "CSV error", description: errorMsg });
          return;
        }
        setRows(res.data);
        setHeaders(res.meta.fields || []);
        // naive auto-map
        const lower = (s: string) => s.toLowerCase().replace(/\s|_/g, '');
        const m: Mapping = {};
        for (const h of res.meta.fields || []) {
          const lh = lower(h);
          if (!m.email && /email/.test(lh)) m.email = h;
          if (!m.first_name && /(firstname|fname|first)/.test(lh)) m.first_name = h;
          if (!m.last_name && /(lastname|lname|last|surname)/.test(lh)) m.last_name = h;
          if (!m.company && /(company|org|organization)/.test(lh)) m.company = h;
          if (!m.title && /(title|role|position)/.test(lh)) m.title = h;
          if (!m.phone && /(phone|mobile|cell)/.test(lh)) m.phone = h;
        }
        setMapping(m);
      },
      error: (error) => {
        const errorMsg = error.message || 'Failed to parse CSV';
        push({ type: "error", title: "CSV error", description: errorMsg });
      }
    });
  }

  async function onImport() {
    setLoading(true);
    try {
      const r = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, mapping, campaignId, userId })
      });
      const j = await r.json();
      setResult(j);
      
      if (j.error) {
        setResult({ error: j.error });
        push({ type: "error", title: "Import failed", description: j.error });
      } else {
        push({ type: "success", title: "Import complete", description: `${j.inserted || j.count} lead(s) added.` });
      }
    } catch (error) {
      console.error('Import error:', error);
      const errorMsg = 'Failed to import leads';
      setResult({ error: errorMsg });
      push({ type: "error", title: "Import failed", description: errorMsg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <label className="block p-6 border-2 border-dashed rounded-2xl cursor-pointer text-center hover:border-gray-300 transition-colors">
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="text-sm text-gray-600">Drag & drop CSV here, or click to browse</div>
      </label>

      {/* Mapping */}
      {headers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Map Columns</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REQUIRED.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-sm font-medium">
                  {f.label} <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full rounded-xl border p-2 focus:outline-none focus:ring-2 focus:ring-black"
                  value={mapping[f.key] || ''}
                  onChange={(e) => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                >
                  <option value="">Select column…</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            {OPTIONAL.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-sm font-medium">{f.label}</label>
                <select
                  className="w-full rounded-xl border p-2 focus:outline-none focus:ring-2 focus:ring-black"
                  value={mapping[f.key as keyof Mapping] || ''}
                  onChange={(e) => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                >
                  <option value="">(None)</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <h4 className="font-medium">Preview (first 5 rows)</h4>
            <div className="overflow-auto border rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t">
                      {headers.map(h => <td key={h} className="px-3 py-2">{String(r[h] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <button
            disabled={!mapping.email || loading}
            onClick={onImport}
            className="px-4 py-2 rounded-2xl bg-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Importing…' : 'Import Leads'}
          </button>

          {/* Result */}
          {result && (
            <div className="text-sm text-gray-700 p-4 bg-gray-50 rounded-xl">
              {result.error ? (
                <div className="text-red-600">Error: {result.error}</div>
              ) : (
                <>
                  <div className="mt-3 font-semibold">Import Results:</div>
                  <div className="mt-2">✓ Inserted: <b>{result.inserted}</b></div>
                  <div>✗ Invalid emails: <b>{result.invalid}</b></div>
                  {result.invalid_samples?.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-red-600">See invalid samples</summary>
                      <pre className="text-xs p-3 bg-white rounded-xl overflow-auto mt-2 border">
                        {JSON.stringify(result.invalid_samples, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}