"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";

const stdFields = ["first_name","last_name","email","company","phone"] as const;

export function ImportWizard({ attachCampaignId }: { attachCampaignId?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string,string>>({
    first_name: "", last_name: "", email: "", company: "", phone: ""
  });
  const [customMap, setCustomMap] = useState<Record<string,string>>({}); // { customKey: csvHeader }
  const [step, setStep] = useState<1|2|3|4>(1);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const hasEmail = Boolean(mapping.email);

  function onFile(f: File) {
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as any[];
        setRows(data);
        const hdrs = res.meta.fields || Object.keys(data[0] || {});
        setHeaders(hdrs as string[]);
        setStep(2);
      },
      error: (err) => {
        alert(`CSV parse error: ${err.message}`);
      }
    });
  }

  async function stage() {
    if (!file) return;
    setLoading(true);
    try {
      const r = await fetch("/api/imports", {
        method: "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ filename: file.name || "upload.csv", rows })
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Stage failed");
        return;
      }
      setJobId(j.job_id);
      setStep(3);
    } catch (err) {
      alert("Failed to stage import");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    if (!jobId) return;
    setLoading(true);
    try {
      const body = {
        mapping: {
          ...mapping,
          custom: customMap
        }
      };
      const r = await fetch(`/api/imports/${jobId}/validate`, {
        method: "POST", 
        headers: { "content-type":"application/json" }, 
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Validate failed");
        return;
      }
      setStats(j.job);
    } catch (err) {
      alert("Failed to validate import");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!jobId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/imports/${jobId}/apply`, {
        method: "POST", 
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ campaign_id: attachCampaignId || null })
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Apply failed");
        return;
      }
      alert(`Imported ${j.applied} leads`);
      setStep(4);
    } catch (err) {
      alert("Failed to apply import");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm font-medium">Lead Import</div>

      {step === 1 && (
        <div className="flex items-center gap-3">
          <Input 
            type="file" 
            accept=".csv" 
            onChange={e=>e.target.files && onFile(e.target.files[0])}
          />
          <div className="text-xs text-muted-foreground">Upload a CSV with headers</div>
        </div>
      )}

      {step >= 2 && (
        <div className="space-y-3">
          <div className="text-sm">Map columns</div>
          <div className="grid md:grid-cols-3 gap-3">
            {stdFields.map(f => (
              <div key={f}>
                <Label className="text-xs">{f}</Label>
                <select 
                  className="w-full border rounded-md px-2 py-2 text-sm"
                  value={mapping[f] || ""}
                  onChange={e=>setMapping({ ...mapping, [f]: e.target.value })}
                >
                  <option value="">(none)</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            {/* Custom field pair adder */}
            <div className="md:col-span-3">
              <Label className="text-xs">Custom fields (optional)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(customMap).map(([k,v])=>(
                  <div key={k} className="flex items-center gap-2 border rounded-md px-2 py-1 text-xs">
                    <span>{k} ← {v}</span>
                    <button 
                      className="underline" 
                      onClick={()=>{ 
                        const m={...customMap}; 
                        delete m[k]; 
                        setCustomMap(m); 
                      }}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input placeholder="custom_key (e.g., title)" id="ckey" />
                <select id="cval" className="border rounded-md px-2">
                  <option value="">(choose column)</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <Button 
                  variant="secondary" 
                  onClick={()=>{
                    const k = (document.getElementById("ckey") as HTMLInputElement).value.trim();
                    const v = (document.getElementById("cval") as HTMLSelectElement).value;
                    if (!k || !v) return;
                    setCustomMap({ ...customMap, [k]: v });
                    (document.getElementById("ckey") as HTMLInputElement).value = "";
                    (document.getElementById("cval") as HTMLSelectElement).value = "";
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={stage} disabled={!hasEmail || loading}>
              {loading ? "Staging..." : "Stage"}
            </Button>
            {!hasEmail && <div className="text-xs text-red-600">Map "email" to continue</div>}
          </div>
        </div>
      )}

      {step >= 3 && jobId && (
        <div className="space-y-2">
          <div className="text-sm">Validation</div>
          <Button variant="secondary" onClick={validate} disabled={loading}>
            {loading ? "Validating..." : "Run validation"}
          </Button>
          {stats && (
            <div className="text-xs mt-2 p-3 rounded border bg-muted/40">
              <div>
                Total: <b>{stats.total_rows}</b> · Valid: <b>{stats.valid_rows}</b> · Invalid: <b>{stats.invalid_rows}</b> · Deduped: <b>{stats.deduped_rows}</b>
              </div>
            </div>
          )}
          {stats && (
            <div className="flex items-center gap-2">
              <Button onClick={apply} disabled={loading}>
                {loading ? "Applying..." : "Apply import"}
              </Button>
              {attachCampaignId && <div className="text-xs">Will attach to campaign</div>}
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="text-sm">✅ Import complete.</div>
      )}
    </Card>
  );
}



