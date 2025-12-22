"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importLeadsWithMapping } from "@/actions/importLeadsWithMapping";

type LeadField =
  | "email"
  | "first_name"
  | "last_name"
  | "company"
  | "city"
  | "ignore"
  | `custom_${string}`;

const BUILT_IN_FIELDS: { label: string; value: LeadField }[] = [
  { label: "Email", value: "email" },
  { label: "First Name", value: "first_name" },
  { label: "Last Name", value: "last_name" },
  { label: "Company", value: "company" },
  { label: "City", value: "city" },
  { label: "Ignore", value: "ignore" },
];

export function ImportLeadsClient({ campaignId }: { campaignId: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, LeadField>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/leads/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to parse CSV.");
        setLoading(false);
        return;
      }
      setHeaders(data.headers || []);
      setSampleRows(data.sampleRows || []);
      // Default guesses: email → email; first/firstname → first_name; etc.
      const defaultMapping: Record<string, LeadField> = {};
      for (const h of data.headers || []) {
        const lower = h.toLowerCase();
        if (lower.includes("email")) defaultMapping[h] = "email";
        else if (lower.includes("first")) defaultMapping[h] = "first_name";
        else if (lower.includes("last")) defaultMapping[h] = "last_name";
        else if (lower.includes("company")) defaultMapping[h] = "company";
        else if (lower.includes("city")) defaultMapping[h] = "city";
        else defaultMapping[h] = "ignore";
      }
      setMapping(defaultMapping);
      setStep(2);
    } catch (e: any) {
      setError("Error parsing CSV.");
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(header: string, value: LeadField) {
    setMapping((prev) => ({ ...prev, [header]: value }));
  }

  function updateCustomName(header: string, customKey: string) {
    setCustomNames((prev) => ({ ...prev, [header]: customKey }));
    setMapping((prev) => ({
      ...prev,
      [header]: (`custom_${customKey}` as LeadField),
    }));
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      // Build final mapping with custom_*
      const finalMapping: any = { ...mapping };
      Object.entries(customNames).forEach(([header, customKey]) => {
        finalMapping[header] = `custom_${customKey}`;
      });

      const res = await importLeadsWithMapping(campaignId, file, finalMapping);
      setResult(res);
      setStep(3);
    } catch (e: any) {
      setError(e.message || "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-3 text-xs">
        <StepBadge active={step === 1} done={step > 1} label="1. Upload CSV" />
        <StepBadge active={step === 2} done={step > 2} label="2. Map columns" />
        <StepBadge active={step === 3} done={step > 3} label="3. Import summary" />
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Upload your lead list</p>
          <p className="text-xs text-muted-foreground">
            Use a CSV with headers like Email, First Name, Last Name, Company, etc.
          </p>
          <Input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
            }}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button onClick={handlePreview} disabled={!file || loading} className="mt-2">
            {loading ? "Reading CSV..." : "Continue"}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Map your columns</p>
          <p className="text-xs text-muted-foreground">
            Tell SmartSend what each column represents. At least one column must be mapped to
            <span className="font-semibold"> Email</span>.
          </p>

          <div className="border rounded max-h-72 overflow-y-auto text-xs">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">CSV Column</th>
                  <th className="p-2 text-left">Sample</th>
                  <th className="p-2 text-left">Map To</th>
                  <th className="p-2 text-left">Custom name (optional)</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header) => {
                  const sample = sampleRows[0]?.[header] ?? "";
                  const current = mapping[header] ?? "ignore";
                  const isCustom = current.startsWith("custom_");

                  return (
                    <tr key={header} className="border-t">
                      <td className="p-2 font-mono">{header}</td>
                      <td className="p-2 truncate max-w-[220px]">{sample}</td>
                      <td className="p-2">
                        <Select
                          value={isCustom ? "custom" : current}
                          onValueChange={(val) => {
                            if (val === "custom") {
                              updateMapping(
                                header,
                                `custom_${customNames[header] || "field"}` as LeadField
                              );
                            } else {
                              updateMapping(header, val as LeadField);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BUILT_IN_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">Custom field</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        {mapping[header]?.startsWith("custom_") && (
                          <Input
                            className="h-8 text-xs"
                            placeholder="e.g. industry"
                            value={customNames[header] || ""}
                            onChange={(e) => updateCustomName(header, e.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button size="sm" onClick={handleImport} disabled={loading}>
              {loading ? "Importing..." : "Import leads"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3 text-sm">
          <p className="font-medium">Import complete</p>
          {result && (
            <ul className="text-xs space-y-1">
              <li>Imported: {result.imported}</li>
              <li>Removed (duplicates inside CSV): {result.duplicates_inside_csv}</li>
              <li>Removed (already in this campaign): {result.duplicates_in_campaign}</li>
              <li>Removed (already in your account): {result.duplicates_global}</li>
            </ul>
          )}

          <div className="flex gap-2 mt-3">
            <Button size="sm" asChild>
              <a href={`/campaigns/${campaignId}`}>Back to campaign</a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStep(1);
                setFile(null);
                setResult(null);
                setHeaders([]);
                setSampleRows([]);
              }}
            >
              Import another file
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function StepBadge({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <div
        className={[
          "w-5 h-5 rounded-full text-[10px] flex items-center justify-center",
          done
            ? "bg-green-600 text-white"
            : active
            ? "bg-primary text-white"
            : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {done ? "✓" : "•"}
      </div>
      <span
        className={[
          "text-[11px]",
          active ? "font-semibold" : "text-muted-foreground",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}


































































