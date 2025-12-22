"use client";

import { useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

type EvalResult = {
  label: string;
  tone?: string;
  score: number;
};

export default function AiSettingsClient() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [results, setResults] = useState<EvalResult[] | null>(null);

  async function runEval() {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) {
        setError("Missing active session");
        return;
      }

      const response = await fetch("/functions/v1/nudge-offline-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: user.id, sample_size: 25 }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error ?? "Evaluation failed");
        return;
      }

      setAvg(typeof payload?.avg === "number" ? payload.avg : 0);
      setResults(Array.isArray(payload?.results) ? payload.results : []);
    } catch (err) {
      console.error("offline eval error", err);
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">AI Offline Evaluation</h1>
        <p className="text-gray-600">
          Run a quick scoring pass against your saved gold references. Use this to benchmark model tweaks before rolling them out.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={runEval}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-70"
        >
          {loading ? "Scoring…" : "Run Offline Eval"}
        </button>
        {avg !== null && (
          <div className="text-sm text-gray-600">
            Average score: <span className="font-semibold">{(avg * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {results && results.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Tone</th>
                <th className="px-4 py-3">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm">
              {results.map((row, idx) => (
                <tr key={`${row.label}-${idx}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 capitalize">{row.label}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{row.tone || "—"}</td>
                  <td className="px-4 py-3 text-gray-900">{(row.score * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Run an evaluation to populate scores. We sample up to 25 examples from your offline eval set.
        </div>
      )}
    </div>
  );
}

















