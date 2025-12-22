"use client";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { getBrowserSupabase } from "@/utils/supabase/client";

type PreviewRow = { row_no:number; email?:string; first_name?:string; last_name?:string; company?:string; title?:string; website?:string; error?:string|null; duplicate?:boolean };

export default function ImportLeadsWizard({ userId }:{ userId:string }) {
  const { push: toast } = useToast();
  const [step, setStep] = useState<1|2|3>(1);
  const [jobId, setJobId] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string,string>>({ email:"" });
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [counts, setCounts] = useState<{ total:number; will_insert:number; deduped:number; skipped:number }|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = getBrowserSupabase();

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Authorization": `Bearer ${session?.access_token || ""}`,
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    };
  }

  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("user_id", userId);
    fd.append("file", f);
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const headers = await getAuthHeaders();
    const res = await fetch(`${supabaseUrl}/functions/v1/import-upload`, { 
      method:"POST", 
      headers,
      body: fd 
    });
    const j = await res.json();
    if (!j.ok && !j.job_id) { 
      toast({ type: "error", description: j.error || "Upload failed" }); 
      return; 
    }
    setJobId(j.job_id); 
    setHeaders(j.headers); 
    setStep(2);
  }

  async function runPreview() {
    if (!mapping.email) { 
      toast({ type: "error", description:"Map the email column" }); 
      return; 
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${supabaseUrl}/functions/v1/import-preview`, {
      method:"POST", 
      headers:{ 
        "content-type":"application/json",
        ...authHeaders
      },
      body: JSON.stringify({ job_id: jobId, user_id: userId, mapping })
    });
    const j = await res.json();
    if (!j.ok) { 
      toast({ type: "error", description:j.error || "Preview failed" }); 
      return; 
    }
    setPreview(j.preview); 
    setCounts(j.counts); 
    setStep(3);
  }

  async function commit() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${supabaseUrl}/functions/v1/import-commit`, {
      method:"POST", 
      headers:{ 
        "content-type":"application/json",
        ...authHeaders
      },
      body: JSON.stringify({ job_id: jobId, user_id: userId })
    });
    const text = await res.text();
    // if CSV (has commas & row_no header), offer download if there are errors
    if (text.startsWith("row_no,reason,")) {
      const blob = new Blob([text], { type:"text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); 
      a.href = url; 
      a.download = `errors_${jobId}.csv`; 
      a.click();
      URL.revokeObjectURL(url);
    }
    toast({ type: "success", description:"Import completed" });
    // Reset wizard
    setStep(1);
    setJobId("");
    setHeaders([]);
    setMapping({ email:"" });
    setPreview([]);
    setCounts(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="text-lg font-semibold">Import Leads</div>

      {step === 1 && (
        <div className="space-y-3">
          <Input type="file" accept=".csv" ref={fileRef} />
          <Button onClick={upload}>Upload</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {["email","first_name","last_name","company","title","website"].map((field) => (
              <div key={field} className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground">{field}</div>
                <Select value={mapping[field] ?? ""} onValueChange={(v)=>setMapping(m => ({ ...m, [field]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>setStep(1)}>Back</Button>
            <Button onClick={runPreview}>Preview</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {counts && (
            <div className="text-sm">
              Total: <b>{counts.total}</b> · To insert: <b>{counts.will_insert}</b> · Duplicates: <b className="text-muted-foreground">{counts.deduped}</b> · Skipped: <b className="text-red-600">{counts.skipped}</b>
            </div>
          )}
          <div className="border rounded-md max-h-72 overflow-auto text-sm">
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">Row</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">First</th>
                  <th className="text-left p-2">Last</th>
                  <th className="text-left p-2">Company</th>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.row_no} className="border-t">
                    <td className="p-2">{r.row_no}</td>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2">{r.first_name}</td>
                    <td className="p-2">{r.last_name}</td>
                    <td className="p-2">{r.company}</td>
                    <td className="p-2">{r.title}</td>
                    <td className="p-2">
                      {r.error ? <span className="text-red-600">error: {r.error}</span>
                        : r.duplicate ? <span className="text-muted-foreground">duplicate</span>
                        : <span className="text-green-600">ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>setStep(2)}>Back</Button>
            <Button onClick={commit}>Commit Import</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

