// app/(dashboard)/campaigns/[campaignId]/CampaignLeadImporter.tsx
"use client";

import { useState } from "react";

interface CampaignLeadImporterProps {
  campaignId: string;
}

type ParsedLead = {
  email: string;
  name?: string;
  city?: string;
};

export function CampaignLeadImporter({ campaignId }: CampaignLeadImporterProps) {
  const [rawInput, setRawInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseLine(line: string): ParsedLead | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Pattern: "Name <email>"
    const angleMatch = trimmed.match(/^(.*)<(.+@.+)>$/);
    if (angleMatch) {
      const name = angleMatch[1].trim().replace(/["']/g, "");
      const email = angleMatch[2].trim();
      return { email, name };
    }

    // Pattern: "email, Name, City"
    const parts = trimmed.split(",").map((p) => p.trim());
    if (parts.length >= 1 && parts[0].includes("@")) {
      const email = parts[0];
      const name = parts[1] || undefined;
      const city = parts[2] || undefined;
      return { email, name, city };
    }

    // Plain email
    if (trimmed.includes("@")) {
      return { email: trimmed };
    }

    return null;
  }

  async function handleImport() {
    setError(null);
    setResult(null);

    const lines = rawInput.split("\n");
    const parsed: ParsedLead[] = [];

    for (const line of lines) {
      const lead = parseLine(line);
      if (lead) parsed.push(lead);
    }

    if (!parsed.length) {
      setError("No valid emails found. Each line should include an email.");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/leads/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: parsed }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to import leads");
      }

      const data = await res.json();
      setResult(`Imported ${data.imported_count} leads.`);
      setRawInput("");
    } catch (err: any) {
      console.error("Lead import error:", err);
      setError(err.message ?? "Failed to import leads");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Add Leads to This Campaign
          </h2>
          <p className="text-xs text-neutral-400">
            Paste one homeowner per line. We&apos;ll turn them into leads
            attached to this campaign.
          </p>
        </div>
      </div>

      <textarea
        rows={6}
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
        placeholder={`Examples:\n\njane@example.com\nJohn Smith <john@home.com>\nowner@roof.com, Sarah Owner, Boise`}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
      />

      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}
      {result && (
        <div className="text-xs text-emerald-300">{result}</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={importing}
          onClick={handleImport}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60"
        >
          {importing ? "Importing…" : "Import Leads"}
        </button>
      </div>
    </div>
  );
}

























































