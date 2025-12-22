"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { createClientComponentClient } from "@/lib/supabase";
import Papa from "papaparse";
import { useRouter, useSearchParams } from "next/navigation";

interface PreviewRow {
  [key: string]: string;
}

export default function ImportLeadsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ importId: string; totalRows: number; validRows: number; duplicateRows: number; invalidRows: number } | null>(null);
  
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load team_id and campaign_id from URL params or user profile
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        // Get team_id from profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.team_id) {
          setTeamId(profile.team_id);
        }

        // Get campaign_id from URL params if present
        const campaignParam = searchParams?.get("campaignId");
        if (campaignParam) {
          setCampaignId(campaignParam);
        }

        // Load campaigns for the user
        const { data: userCampaigns } = await supabase
          .from("campaigns")
          .select("id, name, subject")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (userCampaigns) {
          setCampaigns(userCampaigns);
        }
      } catch (err) {
        console.error("Error loading data:", err);
        setError("Failed to load user data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [supabase, router, searchParams]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    setFile(f);
    setError(null);
    setSuccess(null);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result: any) => {
        if (result.errors && result.errors.length > 0) {
          console.warn("CSV parsing warnings:", result.errors);
        }
        setRows((result.data as PreviewRow[]).slice(0, 20));
      },
      error: (err: any) => {
        console.error("CSV parsing error:", err);
        setError("Failed to parse CSV file: " + (err?.message || String(err)));
      },
    } as any);
  }, []);

  const upload = async () => {
    if (!file || !teamId) {
      setError("Missing file or team ID");
      return;
    }

    setImporting(true);
    setProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("teamId", teamId);
      if (campaignId) {
        formData.append("campaignId", campaignId);
      }

      // Get the Supabase function URL
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("Missing Supabase URL");
      }

      const functionUrl = `${supabaseUrl}/functions/v1/validateCsvUpload`;

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Import failed");
      }

      setSuccess(result);
      setProgress(100);

      // Clear file after successful import
      setTimeout(() => {
        setFile(null);
        setRows([]);
        setProgress(0);
      }, 3000);
    } catch (err) {
      console.error("Import error:", err);
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-sm">Loading...</div>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="p-8">
        <div className="text-red-600">Error: No team found. Please ensure you're part of a team.</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">Import Leads (CSV)</h1>
        <p className="text-gray-600">
          Upload a CSV file to import leads. We'll validate emails, check for duplicates, and prepare them for import.
        </p>
      </div>

      {campaigns.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Link to Campaign (Optional)</label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={campaignId || ""}
            onChange={(e) => setCampaignId(e.target.value || null)}
          >
            <option value="">No campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name || campaign.subject || campaign.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">CSV File</label>
        <Input
          type="file"
          accept=".csv"
          onChange={onFileChange}
          disabled={importing}
        />
        <p className="text-xs text-gray-500">
          Expected columns: email, first_name (or FirstName), last_name (or LastName), company (or Company)
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          <div className="font-semibold mb-1">Import Successful!</div>
          <div>Total rows: {success.totalRows}</div>
          <div>Valid rows: {success.validRows}</div>
          <div>Duplicate rows: {success.duplicateRows}</div>
          <div>Invalid rows: {success.invalidRows}</div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded border p-3 bg-muted/30">
          <div className="font-semibold mb-2">Preview (first 20 rows)</div>
          <div className="overflow-auto max-h-64 text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  {Object.keys(rows[0] || {}).map((k) => (
                    <th key={k} className="border px-2 py-1 text-left font-semibold">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b">
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="border px-2 py-1">
                        {String(v || "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button
        onClick={upload}
        disabled={!file || importing || !teamId}
        size="lg"
      >
        {importing ? "Importing…" : "Validate & Import"}
      </Button>

      {importing && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-xs text-gray-500">Processing your CSV file...</p>
        </div>
      )}

      {success && (
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/import/${success.importId}`)}
          >
            View Import Details
          </Button>
        </div>
      )}
    </div>
  );
}
