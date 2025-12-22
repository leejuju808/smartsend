"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { importLeadsAction } from "@/app/(dashboard)/leads/importActions";

type Row = Record<string, string>;
type MappingKey = "skip"|"email"|"first_name"|"last_name"|"company";

const TARGETS: {key:MappingKey; label:string; required?:boolean}[] = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "company", label: "Company" },
  { key: "skip", label: "Do not import" },
];

export default function LeadsImportPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const workspaceId = sp.get("ws") || localStorage.getItem("active_workspace") || "";
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, MappingKey>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{attempted:number; inserted:number; skipped:number; errors:string[]}|null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setLoading(false);
        const data = (res.data || []).filter(Boolean) as Row[];
        // Trim headers
        const firstRow = data[0] || {};
        const trimmedRows = data.map(row => {
          const trimmed: Row = {};
          Object.keys(row).forEach(k => {
            const trimmedKey = k.trim();
            trimmed[trimmedKey] = row[k];
          });
          return trimmed;
        });
        
        setRows(trimmedRows);
        const hs = Object.keys(firstRow).map(h => h.trim());
        setHeaders(hs);

        // Auto-map: best-effort
        const auto: Record<string, MappingKey> = {};
        hs.forEach((h) => {
          const k = h.toLowerCase();
          if (k.match(/^e-?mail$/) || k.includes("email")) auto[h] = "email";
          else if (k.includes("first")) auto[h] = "first_name";
          else if (k.includes("last")) auto[h] = "last_name";
          else if (k.includes("company") || k.includes("org")) auto[h] = "company";
          else auto[h] = "skip";
        });
        setMapping(auto);
      },
      error: () => setLoading(false),
    });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const mappedPreview = useMemo(() => {
    if (!rows.length) return [];
    const out = rows.slice(0, 50).map((r) => {
      const obj: Record<string,string> = {};
      for (const h of headers) {
        const tgt = mapping[h] || "skip";
        if (tgt !== "skip") obj[tgt] = (r[h] ?? "").trim();
      }
      return obj;
    });
    return out;
  }, [rows, headers, mapping]);

  const missingRequired = useMemo(() => {
    if (!headers.length) return true;
    // ensure at least one header mapped to email
    return !Object.values(mapping).includes("email");
  }, [headers, mapping]);

  const onImport = async () => {
    if (!workspaceId) return alert("Missing workspace id");
    setLoading(true);
    setResult(null);
    try {
      // Build final dataset
      const payload = rows.map((r) => {
        const obj: Record<string,string> = {};
        for (const h of headers) {
          const tgt = mapping[h] || "skip";
          if (tgt !== "skip") obj[tgt] = (r[h] ?? "").trim();
        }
        return obj;
      }).filter(r => r.email); // Only include rows with email

      const result = await importLeadsAction({ 
        workspace_id: workspaceId, 
        rows: payload,
        overwrite: false
      });
      
      setResult(result);
      
      // Refresh leads table after successful import
      if (result.inserted > 0 || result.skipped > 0) {
        // Give user a moment to see the result before navigating
        window.location.href = '/dashboard/leads';
      }
    } catch (e:any) {
      setResult({ attempted: rows.length, inserted:0, skipped:0, errors:[e.message] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Import Leads (CSV)</h1>

      {!rows.length && (
        <Card
          onDragOver={(e)=>e.preventDefault()}
          onDrop={onDrop}
          className="border-dashed"
        >
          <CardContent className="p-8 text-center space-y-3">
            <div className="opacity-80">Drag & drop your CSV here</div>
            <div className="text-xs opacity-60">Required column: <code>email</code>. Optional: <code>first_name</code>, <code>last_name</code>, <code>company</code>.</div>
            <div>
              <Input ref={fileRef} type="file" accept=".csv" onChange={(e)=>e.target.files?.[0] && onFile(e.target.files[0])} className="hidden" />
              <Button onClick={()=>fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" /> Choose file</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!!rows.length && (
        <>
          <Card>
            <CardHeader className="text-lg font-semibold">Map columns</CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <div className="w-1/2 truncate text-sm">{h}</div>
                    <Select value={mapping[h]} onValueChange={(v)=>setMapping(m => ({ ...m, [h]: v as MappingKey }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        {TARGETS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}{t.required ? " *" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {missingRequired ? (
                <div className="text-sm text-amber-600">Map at least one column to <b>Email</b>.</div>
              ) : (
                <div className="text-sm text-green-700 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Ready to import
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-lg font-semibold">Preview (first 50 rows)</CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {["email","first_name","last_name","company"].map(k => <th key={k} className="text-left py-2 pr-3">{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {mappedPreview.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 pr-3">{r.email || ""}</td>
                      <td className="py-2 pr-3">{r.first_name || ""}</td>
                      <td className="py-2 pr-3">{r.last_name || ""}</td>
                      <td className="py-2 pr-3">{r.company || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button onClick={onImport} disabled={loading || missingRequired}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import {rows.length} rows
            </Button>
            <Button variant="outline" onClick={()=>{ setRows([]); setHeaders([]); setMapping({}); setResult(null); }}>Reset</Button>
          </div>

          {result && (
            <Card>
              <CardHeader className="text-lg font-semibold">Import result</CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>Attempted: <b>{result.attempted}</b> • Inserted: <b>{result.inserted}</b> • Skipped: <b>{result.skipped}</b></div>
                {result.errors?.length ? (
                  <div className="text-rose-600">
                    Errors ({result.errors.length}):<br />
                    <ul className="list-disc pl-6">
                      {result.errors.slice(0,10).map((e,i)=><li key={i}>{e}</li>)}
                    </ul>
                    {result.errors.length > 10 && <div>…and more.</div>}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
} 