"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { FieldMap } from "@/components/ColumnMapper";

const supabase = createClientComponentClient();

type ParsedRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  [key: string]: any;
};

export default function OnboardingImportPreviewPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<FieldMap>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreview() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        // Get workspace_id
        const { data: workspaceData } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        const wsId = workspaceData?.workspace_id;
        if (!wsId) {
          setError("Workspace not found");
          setLoading(false);
          return;
        }

        setWorkspaceId(wsId);

        // Get mapping from sessionStorage
        const storedMapping = sessionStorage.getItem("onboarding_mapping");
        if (!storedMapping) {
          router.push("/onboarding/map-columns");
          return;
        }

        const parsedMapping: FieldMap = JSON.parse(storedMapping);
        setMapping(parsedMapping);

        // Download and parse CSV
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("lead_uploads")
          .download(`${wsId}/onboarding/upload.csv`);

        if (downloadError) {
          throw new Error("Failed to load uploaded file");
        }

        const text = await fileData.text();
        Papa.parse<ParsedRow>(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
              setError("Failed to parse CSV file");
              setLoading(false);
              return;
            }

            // Map columns according to mapping
            const mappedRows: ParsedRow[] = results.data.slice(0, 10).map((row: any) => {
              const mapped: ParsedRow = {
                email: mapping.email ? String(row[mapping.email] || "").trim() : "",
                first_name: mapping.first_name ? String(row[mapping.first_name] || "").trim() : undefined,
                last_name: mapping.last_name ? String(row[mapping.last_name] || "").trim() : undefined,
                company: mapping.company ? String(row[mapping.company] || "").trim() : undefined,
              };
              return mapped;
            });

            setRows(mappedRows);
            setLoading(false);
          },
          error: () => {
            setError("Failed to parse CSV file");
            setLoading(false);
          },
        });
      } catch (err: any) {
        setError(err.message || "Failed to load preview");
        setLoading(false);
      }
    }

    loadPreview();
  }, [router]);

  const handleImport = async () => {
    if (!workspaceId || !mapping.email) {
      setError("Missing required information");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      // Download full CSV
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("lead_uploads")
        .download(`${workspaceId}/onboarding/upload.csv`);

      if (downloadError) {
        throw new Error("Failed to load uploaded file");
      }

      const text = await fileData.text();
      
      // Parse all rows
      Papa.parse<ParsedRow>(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          if (results.errors.length > 0) {
            throw new Error("Failed to parse CSV file");
          }

          // Map and validate rows
          const leadsToInsert: Array<{
            workspace_id: string;
            email: string;
            first_name?: string | null;
            last_name?: string | null;
            company?: string | null;
          }> = [];

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const seenEmails = new Set<string>();

          for (const row of results.data) {
            const email = mapping.email ? String(row[mapping.email] || "").trim().toLowerCase() : "";
            
            if (!email || !emailRegex.test(email)) {
              continue; // Skip invalid emails
            }

            if (seenEmails.has(email)) {
              continue; // Skip duplicates
            }

            seenEmails.add(email);

            leadsToInsert.push({
              workspace_id: workspaceId,
              email,
              first_name: mapping.first_name ? String(row[mapping.first_name] || "").trim() || null : null,
              last_name: mapping.last_name ? String(row[mapping.last_name] || "").trim() || null : null,
              company: mapping.company ? String(row[mapping.company] || "").trim() || null : null,
            });
          }

          // Insert homeowners in batches
          const batchSize = 500;
          let inserted = 0;

          for (let i = 0; i < leadsToInsert.length; i += batchSize) {
            const batch = leadsToInsert.slice(i, i + batchSize);
            const { error: insertError } = await supabase
              .from("leads")
              .insert(batch);

            if (insertError) {
              console.error("Insert error:", insertError);
              // Continue with next batch even if one fails
            } else {
              inserted += batch.length;
            }
          }

          // Update onboarding step
          await supabase
            .from("workspaces")
            .update({ onboarding_step: "finished" })
            .eq("id", workspaceId);

          // Redirect to dashboard
          router.push("/dashboard?welcome=1");
        },
        error: (err) => {
          setError("Failed to parse CSV file");
          setImporting(false);
        },
      });
    } catch (err: any) {
      setError(err.message || "Failed to import homeowners");
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto my-10 p-8">
        <div className="text-center">Loading preview...</div>
      </div>
    );
  }

  if (error && !rows.length) {
    return (
      <div className="w-full max-w-2xl mx-auto my-10 p-8">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto my-10 p-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-center">Preview Your Import</h1>
        <p className="text-center text-muted-foreground">
          Review the first 10 rows before importing
        </p>
      </div>

      {/* Preview Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left font-medium">Email</th>
                <th className="p-3 text-left font-medium">First Name</th>
                <th className="p-3 text-left font-medium">Last Name</th>
                <th className="p-3 text-left font-medium">Company</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-3">{row.email}</td>
                  <td className="p-3">{row.first_name || "-"}</td>
                  <td className="p-3">{row.last_name || "-"}</td>
                  <td className="p-3">{row.company || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <Button
          onClick={handleImport}
          disabled={importing}
          size="lg"
          className="min-w-[200px]"
        >
          {importing ? "Importing..." : "Import Homeowners"}
        </Button>
      </div>
    </div>
  );
}


