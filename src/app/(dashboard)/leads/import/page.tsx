"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

export default function ImportLeads() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [header, setHeader] = useState<string[]>([]);
  const [sample, setSample] = useState<any[]>([]);
  const [mapping, setMapping] = useState<any>({
    email: "",
    name: "",
    company: "",
    custom: {},
  });
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [teamId, setTeamId] = useState<string>("");

  const supabase = createClientComponentClient();
  const router = useRouter();

  // Get user's team_id on mount
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .single();
        if (profile?.team_id) {
          setTeamId(profile.team_id);
        }
      }
    })();
  }, [supabase]);

  const onUpload = async () => {
    if (!file || !teamId) return;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("team_id", teamId);

    try {
      const r = await fetch("/api/imports/start", {
        method: "POST",
        body: fd,
      });

      if (!r.ok) {
        const err = await r.json();
        alert(err.error || "Upload failed");
        return;
      }

      const j = await r.json();
      setJobId(j.job_id);
      setHeader(j.header);
      setSample(j.sampleRows);
      setStep(2);
    } catch (error) {
      alert("Upload failed");
      console.error(error);
    }
  };

  const onProcess = async () => {
    if (!file || !mapping.email) return;

    setProcessing(true);

    try {
      const text = await file.text();
      const r = await fetch("/api/imports/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, mapping, fileText: text }),
      });

      const j = await r.json();

      if (!r.ok) {
        alert(j.error || "Processing failed");
        setProcessing(false);
        return;
      }

      setResult(j);
      setProcessing(false);
      setStep(3);
    } catch (error) {
      alert("Processing failed");
      console.error(error);
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold">Import Leads</h1>

      {step === 1 && (
        <div className="rounded-2xl border p-4 space-y-3">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full"
          />
          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={onUpload}
            disabled={!file}
          >
            Upload
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="font-medium mb-2">Map Columns</div>
            <div className="grid grid-cols-3 gap-3">
              {["email", "name", "company"].map((k) => (
                <div key={k} className="space-y-1">
                  <div className="text-xs opacity-70">{k.toUpperCase()}</div>
                  <select
                    className="h-9 rounded-md border px-2 text-sm w-full"
                    value={mapping[k] || ""}
                    onChange={(e) =>
                      setMapping((m: any) => ({ ...m, [k]: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {header.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs opacity-70">
              Tip: you can add custom mappings later in lead meta.
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="font-medium mb-2">Preview (first 10)</div>
            <div className="text-xs grid grid-cols-3 gap-2">
              {sample.slice(0, 10).map((row, i) => (
                <div key={i} className="rounded-lg border p-2">
                  <div>Email: {row[mapping.email] || "—"}</div>
                  <div>Name: {row[mapping.name] || "—"}</div>
                  <div>Company: {row[mapping.company] || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={onProcess}
            disabled={!mapping.email || processing}
          >
            {processing ? "Processing…" : "Validate & Import"}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="font-medium">Import Complete</div>
          <div className="text-sm opacity-70">
            Imported: {result?.imported} / {result?.total}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => router.push("/leads")}
            >
              Go to Leads
            </button>
            <button
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => {
                setStep(1);
                setFile(null);
                setResult(null);
              }}
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
