"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Upload, Info } from "lucide-react";

export default function ImportContactsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [mapping, setMapping] = useState<string>(JSON.stringify({
    email: "Email",
    first_name: "First Name",
    last_name: "Last Name",
    company: "Company",
    title: "Title",
    phone: "Phone",
    custom: ["Notes"]
  }, null, 2));

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleImport() {
    setErrorMsg(null);
    setResult(null);
    if (!file) {
      setErrorMsg("Please select a CSV file.");
      return;
    }
    if (!workspaceId) {
      setErrorMsg("Please provide a workspaceId.");
      return;
    }
    let mappingObj: any;
    try {
      mappingObj = JSON.parse(mapping);
    } catch {
      setErrorMsg("Mapping must be valid JSON.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("workspaceId", workspaceId);
    if (campaignId) fd.append("campaignId", campaignId);
    fd.append("mapping", JSON.stringify(mappingObj));

    setLoading(true);
    try {
      const res = await fetch("/api/import/contacts", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
    } catch (e: any) {
      setErrorMsg(e.message || "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Import Contacts (CSV) — Dedupe & Suppression Guard</h1>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>
          We automatically skip <strong>invalid emails</strong>, <strong>duplicates</strong>, and any address on your <strong>global</strong> or <strong>campaign</strong> suppression lists.
          If enabled in settings, we also <strong>auto-suppress role accounts</strong> (e.g., info@, support@) to protect deliverability.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <Input 
              label="Workspace ID (UUID)"
              placeholder="e.g., 00000000-0000-0000-0000-000000000000" 
              value={workspaceId} 
              onChange={setWorkspaceId} 
            />
          </div>

          <div className="space-y-1">
            <Input 
              label="Campaign ID (optional, UUID)"
              placeholder="(optional)" 
              value={campaignId} 
              onChange={setCampaignId} 
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">CSV File</label>
            <input 
              type="file" 
              accept=".csv,text/csv" 
              onChange={(e) => setFile(e.target.files?.[0] || null)} 
              className="mt-1 w-full rounded-xl border p-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Column Mapping (JSON)</label>
            <Textarea rows={10} value={mapping} onChange={(e) => setMapping(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Map your CSV headers to fields. <code>email</code> is required. Any extra headers can go into <code>custom</code>.
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={loading}>
              <Upload className="h-4 w-4 mr-2" />
              {loading ? "Importing..." : "Start Import"}
            </Button>
          </div>

          {errorMsg && (
            <Alert className="mt-4">
              <AlertTitle>Import Error</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="mt-4 space-y-2">
              <h2 className="text-lg font-medium">Import Summary</h2>
              {result.flags?.paywalledRoleAutoSuppress && (
                <p className="text-xs text-muted-foreground">
                  Auto-suppress role accounts is available on paid plans. <strong>Upgrade</strong> to enable one-click hygiene.
                </p>
              )}
              {result.flags?.autoSuppressRoles === false && (
                <p className="text-xs text-muted-foreground">
                  Auto-suppress role accounts is <strong>OFF</strong> in settings. Role emails were allowed but flagged.
                </p>
              )}
              <ul className="text-sm leading-6">
                <li>Total rows: <strong>{result.counts.total_rows}</strong></li>
                <li>Valid: <strong>{result.counts.valid}</strong></li>
                <li>Inserted: <strong>{result.counts.inserted}</strong></li>
                <li>Skipped — Invalid email: <strong>{result.counts.skipped_invalid_email}</strong></li>
                <li>Skipped — In-file duplicates: <strong>{result.counts.skipped_duplicate_in_file}</strong></li>
                <li>Skipped — Existing contacts: <strong>{result.counts.skipped_existing_contact}</strong></li>
                <li>Skipped — Global suppression: <strong>{result.counts.skipped_suppressed_global}</strong></li>
                <li>Skipped — Campaign suppression: <strong>{result.counts.skipped_suppressed_campaign}</strong></li>
                <li>Skipped — Role accounts (auto-suppressed): <strong>{result.counts.skipped_role_accounts}</strong></li>
                <li>Flagged — Role accounts (allowed due to setting OFF): <strong>{result.counts.flagged_role_accounts}</strong></li>
              </ul>

              {result.sample_errors?.length > 0 && (
                <div className="mt-2">
                  <h3 className="font-medium">Sample Issues (first 20)</h3>
                  <pre className="text-xs bg-muted p-3 rounded-xl overflow-auto">
                    {JSON.stringify(result.sample_errors, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 