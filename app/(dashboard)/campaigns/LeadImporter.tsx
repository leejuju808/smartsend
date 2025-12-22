'use client';
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Simple toast implementation
const toast = {
  error: (msg: string) => alert(`Error: ${msg}`),
  success: (msg: string) => alert(`Success: ${msg}`),
};

function Modal({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={() => onOpenChange(false)}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
        {children}
      </div>
    </div>
  );
}

const REQUIRED = ['email'];
const OPTIONAL = ['first_name','last_name','company'];

export default function LeadImporter({ campaignId }: { campaignId: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string,string>>({});
  const [preview, setPreview] = useState<string[][]>([]);
  const [uploading, setUploading] = useState(false);

  function onChooseFile() { fileRef.current?.click(); }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      toast.error('Please select a .csv file');
      return;
    }
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(l => l.split(','));
    setHeaders(head);
    setPreview(rows.slice(0, 5));
    // naive auto-map by common names
    const auto: Record<string,string> = {};
    for (const key of [...REQUIRED, ...OPTIONAL]) {
      const found = head.find(h => h.toLowerCase().replace(/\s+/g,'_') === key) || head.find(h => h.toLowerCase().includes(key.replace('_',' ')));
      if (found) auto[key] = found;
    }
    setMapping(auto);
    setOpen(true);
  }

  const allGood = useMemo(() => REQUIRED.every(r => mapping[r]), [mapping]);

  async function confirmImport() {
    if (!allGood) {
      toast.error('Map at least the email column.');
      return;
    }
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('campaign_id', campaignId);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await fetch('/api/import-leads-campaign', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      const { inserted, skipped, errors, errorCsvUrl } = data;
      toast.success(`${inserted} inserted • ${skipped} duplicates • ${errors} errors`);
      if (errorCsvUrl) {
        const a = document.createElement('a');
        a.href = errorCsvUrl; a.download = 'import_errors.csv'; a.click();
      }
      setOpen(false);
    } catch (e:any) {
      toast.error(e.message);
    } finally { setUploading(false); }
  }

  return (
    <div className="space-y-3">
      <Input type="file" className="hidden" ref={fileRef} onChange={handleFile} accept=".csv" />
      <Button onClick={onChooseFile} variant="default">Upload CSV</Button>

      <Modal open={open} onOpenChange={setOpen}>
        <div>
          <h2 className="text-xl font-semibold mb-4">Map Columns</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[...REQUIRED, ...OPTIONAL].map(k => (
                <div key={k} className="flex flex-col gap-1">
                  <Label>{k}</Label>
                  <select className="border rounded p-2"
                    value={mapping[k] || ''}
                    onChange={e => setMapping(m => ({ ...m, [k]: e.target.value }))}
                  >
                    <option value="">— Not Mapped —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div>
              <Label>Preview (first 5 rows)</Label>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>{headers.map(h => <th key={h} className="text-left p-2 border-b">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r,i)=>(
                      <tr key={i}>
                        {r.map((c,j)=>(<td key={j} className="p-2 border-b">{c}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Guardrails: 10k row cap • dup email check • downloadable error CSV</div>
              <Button disabled={uploading || !allGood} onClick={confirmImport}>{uploading ? 'Importing…' : 'Start Import'}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

