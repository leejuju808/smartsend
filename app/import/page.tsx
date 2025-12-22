"use client";
import { useEffect, useState } from "react";

type Seq = { id: string; name: string };

export default function ImportPage() {
  const [sequences, setSequences] = useState<Seq[]>([]);
  const [sequenceId, setSequenceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [defaultDelay, setDefaultDelay] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/sequences", { cache: "no-store" });
      const data = await res.json();
      setSequences(data.sequences || []);
      if (data.sequences?.[0]) setSequenceId(data.sequences[0].id);
    })();
  }, []);

  const submit = async () => {
    if (!file || !sequenceId) return alert("Choose a CSV and sequence");
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("sequence_id", sequenceId);
    fd.append("default_delay_hours", String(defaultDelay));

    const res = await fetch("/api/import-leads", { method: "POST", body: fd });
    const data = await res.json();
    setResult(data);
    setBusy(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Bulk Import Leads → Enroll</h1>
      <p className="text-gray-400 mb-6">Upload a CSV and enroll each email into a selected sequence.</p>

      <div className="space-y-4 border border-gray-800 rounded-2xl p-5 bg-gray-950">
        <div>
          <label className="text-sm text-gray-300">Sequence</label>
          <select
            value={sequenceId}
            onChange={(e) => setSequenceId(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg text-black"
          >
            {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-300">Default start delay (hours)</label>
          <input
            type="number"
            value={defaultDelay}
            onChange={(e) => setDefaultDelay(Number(e.target.value))}
            className="w-full mt-1 px-3 py-2 rounded-lg text-black"
            min={0}
          />
          <p className="text-xs text-gray-500 mt-1">
            Applied when a row lacks <code>start_in_hours</code>. Final first send = this + Step 1 delay.
          </p>
        </div>

        <div>
          <label className="text-sm text-gray-300">CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">
            Headers: <code>email,name,start_in_hours</code> (only <code>email</code> is required).
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={busy || !file}
            className="px-5 py-2 rounded-lg bg-yellow-500 text-black font-semibold disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import & Enroll"}
          </button>
          <a href="/dashboard" className="px-5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700">Back to Dashboard</a>
        </div>
      </div>

      {result && (
        <div className="mt-6 border border-gray-800 rounded-2xl p-5 bg-gray-950">
          <div className="font-semibold mb-2">Result</div>
          <pre className="text-sm text-gray-300 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        Tip: After import, your existing **scheduler** + **worker** will queue and send emails automatically.
      </div>
    </div>
  );
}