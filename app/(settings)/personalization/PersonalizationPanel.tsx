"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

type SnippetRow = {
  id: string;
  body: string;
  industry: string | null;
  role_hint: string | null;
  tech_stack: string[] | null;
  region: string | null;
  success_count: number;
  fail_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TestResult = {
  body: string;
  score: number | null;
  role_hint?: string | null;
  tech_stack?: string[] | null;
  industry?: string | null;
  region?: string | null;
};

const seedSnippets = [
  {
    role_hint: "RevOps",
    tech_stack: ["HubSpot"],
    body:
      "We helped a RevOps team cut lead-to-first-touch from 19h → 2h by auto-routing replies into HubSpot and pausing sequences instantly."
  },
  {
    role_hint: "Head of Sales",
    tech_stack: ["Salesforce"],
    body:
      "A similar team saw 14% more meetings when follow-ups adapted tone after objections in Salesforce sequences."
  },
  {
    industry: "SaaS",
    body: "SmartSend plugged into their SaaS stack and reduced manual triage by ~6 hrs/week per AE."
  }
];

export default function PersonalizationPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [snippets, setSnippets] = useState<SnippetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importText, setImportText] = useState(JSON.stringify(seedSnippets, null, 2));
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importing, setImporting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testCompany, setTestCompany] = useState("");
  const [testRole, setTestRole] = useState("");
  const [testTech, setTestTech] = useState("");
  const [testIndustry, setTestIndustry] = useState("");
  const [testRegion, setTestRegion] = useState("");
  const [testSummary, setTestSummary] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function fetchSnippets() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("personalization_snippets")
        .select(
          "id, body, industry, role_hint, tech_stack, region, success_count, fail_count, is_active, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }
      setSnippets(data ?? []);
    } catch (error: any) {
      console.error("Failed to load personalization snippets", error);
      toast.error(error?.message ?? "Failed to load snippets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSnippets();
  }, []);

  const activeCount = useMemo(() => snippets.filter((row) => row.is_active).length, [snippets]);

  async function toggleSnippet(id: string, isActive: boolean) {
    try {
      const { error } = await supabase
        .from("personalization_snippets")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
      setSnippets((prev) =>
        prev.map((row) => (row.id === id ? { ...row, is_active: isActive } : row))
      );
    } catch (error: any) {
      console.error("Failed to toggle snippet", error);
      toast.error(error?.message ?? "Failed to update snippet");
    }
  }

  async function handleImport() {
    if (!importText.trim()) {
      toast.error("Paste JSON or CSV before importing");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/personalization/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: importFormat, text: importText })
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result?.error ?? "Import failed");
      }
      toast.success(`Imported ${result?.count ?? "new"} snippets`);
      await fetchSnippets();
    } catch (error: any) {
      console.error("Import failed", error);
      toast.error(error?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/personalization/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: testCompany || null,
          role: testRole || null,
          industry: testIndustry || null,
          region: testRegion || null,
          tech_stack: testTech ? testTech.split(/[,;]+/).map((item) => item.trim()).filter(Boolean) : null,
          summary: testSummary || null
        })
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result?.error ?? "Personalization test failed");
      }
      if (result?.snippet) {
        setTestResult(result.snippet as TestResult);
      } else {
        setTestResult(null);
        toast.info("No matching snippet yet — add more coverage.");
      }
    } catch (error: any) {
      console.error("Test failed", error);
      toast.error(error?.message ?? "Failed to test personalization");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Snippets</h2>
            <p className="text-sm text-muted-foreground">
              Active: {activeCount} / {snippets.length}. Aim for coverage by role, industry, and tech stack.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchSnippets} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Body</th>
                <th className="px-4 py-3 text-left font-medium">Filters</th>
                <th className="px-4 py-3 text-left font-medium">Success</th>
                <th className="px-4 py-3 text-left font-medium">Fail</th>
                <th className="px-4 py-3 text-left font-medium">Win%</th>
                <th className="px-4 py-3 text-left font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading snippets…
                  </td>
                </tr>
              )}
              {!loading && snippets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No personalization snippets yet. Import a few seed proof points below.
                  </td>
                </tr>
              )}
              {!loading &&
                snippets.map((snippet) => {
                  const attempts = (snippet.success_count ?? 0) + (snippet.fail_count ?? 0);
                  const winRate = attempts > 0 ? (snippet.success_count / attempts) * 100 : 0;
                  return (
                    <tr key={snippet.id} className="align-top">
                      <td className="px-4 py-3 text-sm">
                        <p className="whitespace-pre-line">{snippet.body}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Updated {new Date(snippet.updated_at ?? snippet.created_at).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 text-xs">
                          {snippet.role_hint && <Badge variant="secondary">{snippet.role_hint}</Badge>}
                          {snippet.industry && <Badge variant="secondary">{snippet.industry}</Badge>}
                          {snippet.region && <Badge variant="secondary">{snippet.region}</Badge>}
                          {snippet.tech_stack?.map((tech) => (
                            <Badge key={`${snippet.id}-${tech}`} variant="outline">
                              {tech}
                            </Badge>
                          ))}
                          {!snippet.role_hint &&
                            !snippet.industry &&
                            !snippet.region &&
                            !(snippet.tech_stack?.length) && (
                              <span className="text-muted-foreground">Any contact</span>
                            )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{snippet.success_count ?? 0}</td>
                      <td className="px-4 py-3 text-sm font-medium">{snippet.fail_count ?? 0}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {attempts > 0 ? `${winRate.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={snippet.is_active}
                          onCheckedChange={(value) => toggleSnippet(snippet.id, Boolean(value))}
                          aria-label="Toggle snippet active"
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Bulk Import</h2>
            <p className="text-sm text-muted-foreground">
              Paste JSON or CSV. We&apos;ll embed each line and store it for personalization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={importFormat}
              onChange={(event) => setImportFormat(event.target.value as "json" | "csv")}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportText(JSON.stringify(seedSnippets, null, 2))}
            >
              Load Seed Sample
            </Button>
            <Button type="button" onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : "Import Snippets"}
            </Button>
          </div>
        </div>
        <Textarea
          rows={12}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={importFormat === "json" ? '[{ "role_hint": "RevOps", "body": "…" }]' : 'body,role_hint,tech_stack'}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Live Test</h2>
          <p className="text-sm text-muted-foreground">
            Enter lead context to preview which snippet will trigger right now.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <Input value={testCompany} onChange={(e) => setTestCompany(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Input value={testRole} onChange={(e) => setTestRole(e.target.value)} placeholder="Head of Sales" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tech Stack</label>
            <Input
              value={testTech}
              onChange={(e) => setTestTech(e.target.value)}
              placeholder="HubSpot, Salesforce"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Industry</label>
            <Input value={testIndustry} onChange={(e) => setTestIndustry(e.target.value)} placeholder="SaaS" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Region</label>
            <Input value={testRegion} onChange={(e) => setTestRegion(e.target.value)} placeholder="US" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Thread Summary / Notes</label>
          <Textarea
            rows={4}
            value={testSummary}
            onChange={(e) => setTestSummary(e.target.value)}
            placeholder="Recent objections, campaign angle, anything helpful..."
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleTest} disabled={testing}>
            {testing ? "Testing…" : "Run Similarity Test"}
          </Button>
          {testResult && (
            <span className="text-xs text-muted-foreground">
              Score: {typeof testResult.score === "number" ? testResult.score.toFixed(3) : "n/a"}
            </span>
          )}
        </div>
        <div className="rounded-lg border border-dashed p-4 text-sm">
          {testing && <div className="text-muted-foreground">Computing nearest snippet…</div>}
          {!testing && !testResult && (
            <div className="text-muted-foreground">
              No snippet selected yet. Import a few more snippets to cover this persona.
            </div>
          )}
          {!testing && testResult && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wide text-emerald-700">Match</span>
                {testResult.role_hint && <Badge variant="outline">{testResult.role_hint}</Badge>}
                {testResult.industry && <Badge variant="outline">{testResult.industry}</Badge>}
                {testResult.region && <Badge variant="outline">{testResult.region}</Badge>}
                {testResult.tech_stack?.map((tech) => (
                  <Badge key={`test-${tech}`} variant="secondary">
                    {tech}
                  </Badge>
                ))}
              </div>
              <p className="text-base font-medium text-foreground">{testResult.body}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

















