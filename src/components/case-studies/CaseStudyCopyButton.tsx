"use client";

import { useMemo, useState } from "react";

type CaseStudy = {
  id: string;
  title: string;
  snapshot_json?: any;
  metrics_json?: any;
};

function safeStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function buildPlainText(cs: CaseStudy): string {
  const snapshot = cs.snapshot_json?.snapshot || {};
  const city = safeStr(snapshot.city);
  const state = safeStr(snapshot.state);
  const location = [city, state].filter(Boolean).join(", ") || "—";

  const companySize = safeStr(snapshot.company_size_range || "—");
  const timeDays = Number(snapshot.time_using_smartsend_days ?? 0);
  const timeUsing =
    Number.isFinite(timeDays) && timeDays > 0 ? `${timeDays} day${timeDays === 1 ? "" : "s"}` : "—";

  const problem = safeStr(cs.snapshot_json?.problem || "—");
  const solution = Array.isArray(cs.snapshot_json?.solution) ? cs.snapshot_json.solution : [];
  const results = Array.isArray(cs.snapshot_json?.results) ? cs.snapshot_json.results : [];

  const lines: string[] = [];
  lines.push(cs.title);
  lines.push("");
  lines.push("Snapshot");
  lines.push(`- City / State: ${location}`);
  lines.push(`- Company size: ${companySize}`);
  lines.push(`- Time using SmartSend: ${timeUsing}`);
  lines.push("");
  lines.push("Problem");
  lines.push(problem);
  lines.push("");
  lines.push("Solution");
  if (solution.length === 0) {
    lines.push("- —");
  } else {
    for (const s of solution) lines.push(`- ${safeStr(s?.label || s)}`);
  }
  lines.push("");
  lines.push("Results");
  if (results.length === 0) {
    lines.push("- —");
  } else {
    for (const r of results) lines.push(`- ${safeStr(r?.label || "Result")}: ${safeStr(r?.value ?? "—")}`);
  }
  lines.push("");
  lines.push('Quote');
  lines.push('“SmartSend paid for itself after the first job.”');
  lines.push("(Anonymous, standardized.)");
  return lines.join("\n");
}

export function CaseStudyCopyButton(props: { caseStudy: CaseStudy; label?: string }) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => buildPlainText(props.caseStudy), [props.caseStudy]);
  const label = props.label || "Copy";

  return (
    <button
      type="button"
      className="inline-flex items-center px-3 py-1.5 rounded border bg-white hover:bg-slate-50 text-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          // noop
        }
      }}
      title="Copy case study text"
    >
      {copied ? "Copied" : label}
    </button>
  );
}









