"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface PreflightResult {
  severity: "LOW" | "MEDIUM" | "HIGH";
  issues?: Array<{
    code: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    message: string;
    hint?: string;
  }>;
  metrics?: {
    subject_len?: number;
    links?: number;
    reading_grade?: number;
    [key: string]: any;
  };
  domain?: {
    spf: boolean | null;
    dkim: boolean | null;
    dmarc: boolean | null;
  } | null;
}

interface PreflightPanelProps {
  onRun: () => Promise<PreflightResult>;
  last?: PreflightResult | null;
}

export default function PreflightPanel({ onRun, last }: PreflightPanelProps) {
  const [res, setRes] = useState<PreflightResult | null>(last || null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const j = await onRun();
      setRes(j);
    } catch (e: any) {
      console.error("Preflight error:", e);
      setRes({ severity: "HIGH", issues: [{ code: "ERROR", severity: "HIGH", message: e.message || "Failed to run preflight" }] });
    } finally {
      setLoading(false);
    }
  };

  const sevClass = (s?: string) =>
    s === "HIGH"
      ? "bg-red-100 text-red-800 border-red-300"
      : s === "MEDIUM"
      ? "bg-yellow-100 text-yellow-800 border-yellow-300"
      : "bg-green-100 text-green-800 border-green-300";

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Deliverability Preflight</h3>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? "Checking…" : "Run Check"}
        </Button>
      </div>

      {res && (
        <>
          <div className={`inline-flex px-2 py-1 rounded-full text-xs border ${sevClass(res.severity)}`}>
            {res.severity ?? "—"} risk
          </div>

          {res.domain && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`px-2 py-1 rounded-full border ${res.domain.spf ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
              >
                SPF {res.domain.spf ? "✅" : "❌"}
              </span>
              <span
                className={`px-2 py-1 rounded-full border ${res.domain.dkim ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
              >
                DKIM {res.domain.dkim ? "✅" : "❌"}
              </span>
              <span
                className={`px-2 py-1 rounded-full border ${res.domain.dmarc ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50"}`}
              >
                DMARC {res.domain.dmarc ? "✅" : "⚠️"}
              </span>
            </div>
          )}

          {res.issues && res.issues.length > 0 && (
            <ul className="text-sm list-disc pl-5 space-y-1">
              {res.issues.map((i, idx) => (
                <li key={idx}>
                  <span className={`font-medium ${i.severity === "HIGH" ? "text-red-700" : i.severity === "MEDIUM" ? "text-yellow-700" : "text-green-700"}`}>
                    {i.severity}
                  </span>
                  {" — "}
                  {i.message}
                  {i.hint ? <span className="text-muted-foreground"> — {i.hint}</span> : null}
                </li>
              ))}
            </ul>
          )}

          {res.issues?.length === 0 && (
            <p className="text-sm text-green-700">✓ No issues detected!</p>
          )}

          {res.metrics && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              Subject {res.metrics.subject_len ?? 0} chars • Links {res.metrics.links ?? 0} • Grade ≈ {res.metrics.reading_grade ?? 0}
            </div>
          )}
        </>
      )}
    </div>
  );
}

