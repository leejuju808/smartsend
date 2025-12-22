'use client';
import React, { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const REQUIRED = ['email'];
const OPTIONAL = ['first_name','last_name','company'];

export default function LeadImporter({ campaignId }: { campaignId: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string,string>>({});
  const [preview, setPreview] = useState<string[][]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  function onChooseFile() { fileRef.current?.click(); }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      toast({ title: 'Invalid file', description: 'Please select a .csv file', variant: 'destructive' });
      return;
    }
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(l => l.split(','));
    setHeaders(head);
    setPreview(rows.slice(0, 5));
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
      toast({ title: 'Missing mappings', description: 'Map at least the email column.', variant: 'destructive' });
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
      const res = await fetch('/api/import-leads', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      const { inserted, skipped, errors, errorCsvUrl } = data;
      toast({ title: 'Import complete', description: `${inserted} inserted • ${skipped} duplicates • ${errors} errors` });
      if (errorCsvUrl) {
        const a = document.createElement('a');
        a.href = errorCsvUrl; a.download = 'import_errors.csv'; a.click();
      }
      setOpen(false);
    } catch (e:any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }

  return (
    <div className="space-y-3">
      <Input type="file" className="hidden" ref={fileRef} onChange={handleFile} accept=".csv" />
      <Button onClick={onChooseFile} variant="default">Upload CSV</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Map Columns</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}


