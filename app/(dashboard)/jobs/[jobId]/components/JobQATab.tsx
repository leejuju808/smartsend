// Block 27940 — SmartSend Roofing QA & Completion Verification Engine v1
// Component: Job QA Tab
// Displays QA results and allows triggering QA runs

"use client";

import { useEffect, useState } from "react";

interface QARun {
  id: string;
  status: string;
  overall_result: string | null;
  ai_summary: string | null;
  homeowner_summary: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Finding {
  id: string;
  severity: string;
  category: string;
  message: string;
}

export function JobQATab({ jobId }: { jobId: string }) {
  const [qa, setQa] = useState<QARun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/jobs/${jobId}/qa`);
      if (!res.ok) {
        throw new Error("Failed to load QA data");
      }
      const data = await res.json();
      setQa(data.qa_run);
      setFindings(data.findings || []);
    } catch (error) {
      console.error("Error loading QA:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [jobId]);

  const handleRunQA = async () => {
    try {
      setRunning(true);
      const res = await fetch("/api/jobs/run-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to run QA");
      }

      // Reload QA data
      await load();
      alert("QA check completed successfully!");
    } catch (error: any) {
      console.error("Error running QA:", error);
      alert(error.message || "Failed to run QA check");
    } finally {
      setRunning(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      const res = await fetch("/api/jobs/generate-completion-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate report");
      }

      alert("Completion report generated successfully!");
    } catch (error: any) {
      console.error("Error generating report:", error);
      alert(error.message || "Failed to generate completion report");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-zinc-50">Quality Assurance</h1>
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!qa) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-zinc-50">Quality Assurance</h1>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          <p className="mb-4">No QA check has been run for this job yet.</p>
          <button
            onClick={handleRunQA}
            disabled={running}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Running QA..." : "Run QA Now"}
          </button>
        </div>
      </div>
    );
  }

  const getResultColor = (result: string | null) => {
    if (!result) return "text-zinc-400";
    if (result === "pass") return "text-green-400";
    if (result === "minor_issues") return "text-yellow-400";
    return "text-red-400";
  };

  const getSeverityColor = (severity: string) => {
    if (severity === "critical") return "text-red-600 font-semibold";
    if (severity === "warning") return "text-yellow-700 font-semibold";
    return "text-zinc-400";
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">Quality Assurance</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRunQA}
            disabled={running}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Running..." : "Re-run QA"}
          </button>
          <button
            onClick={handleGenerateReport}
            disabled={generating || qa.status !== "completed"}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generating..." : "Generate Completion Report"}
          </button>
        </div>
      </div>

      {/* QA Status Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-zinc-500">Status: </span>
            <span className="font-semibold text-zinc-50">
              {qa.status.toUpperCase()}
            </span>
          </div>
          {qa.overall_result && (
            <div>
              <span className="text-zinc-500">Result: </span>
              <span className={`font-semibold ${getResultColor(qa.overall_result)}`}>
                {qa.overall_result.toUpperCase().replace("_", " ")}
              </span>
            </div>
          )}
        </div>

        {qa.completed_at && (
          <div className="text-xs text-zinc-500">
            Completed: {new Date(qa.completed_at).toLocaleString()}
          </div>
        )}

        {qa.ai_summary && (
          <div className="mt-4">
            <div className="text-xs font-medium text-zinc-500 mb-2">AI Summary:</div>
            <div className="text-xs text-zinc-300 whitespace-pre-wrap bg-zinc-900 p-3 rounded-lg">
              {qa.ai_summary}
            </div>
          </div>
        )}

        {qa.homeowner_summary && (
          <div className="mt-4">
            <div className="text-xs font-medium text-zinc-500 mb-2">
              Homeowner Summary:
            </div>
            <div className="text-xs text-zinc-300 whitespace-pre-wrap bg-zinc-900 p-3 rounded-lg">
              {qa.homeowner_summary}
            </div>
          </div>
        )}
      </div>

      {/* Findings Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
        <h2 className="font-semibold mb-3 text-zinc-50">Findings</h2>
        {findings.length === 0 ? (
          <div className="text-xs text-zinc-500">No findings reported.</div>
        ) : (
          <ul className="space-y-2 text-xs">
            {findings.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-2 p-2 rounded-lg bg-zinc-900"
              >
                <span className={getSeverityColor(f.severity)}>
                  [{f.severity.toUpperCase()}]
                </span>
                <div className="flex-1">
                  <span className="font-semibold text-zinc-300">{f.category}: </span>
                  <span className="text-zinc-400">{f.message}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}



































