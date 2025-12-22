"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Papa from "papaparse";
import { ColumnMapper, FieldMap } from "@/components/ColumnMapper";
import { Button } from "@/components/ui/button";
const supabase = createClientComponentClient();

export default function OnboardingMapColumnsPage() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<FieldMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadFile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        // Get workspace_id from workspace_members
        const { data: workspaceData } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        const workspace_id = workspaceData?.workspace_id;
        if (!workspace_id) {
          setError("Workspace not found");
          setLoading(false);
          return;
        }

        setWorkspaceId(workspace_id);

        // Download file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("lead_uploads")
          .download(`${workspace_id}/onboarding/upload.csv`);

        if (downloadError) {
          throw new Error("Failed to load uploaded file");
        }

        // Parse CSV to get headers
        const text = await fileData.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
              setError("Failed to parse CSV file");
              setLoading(false);
              return;
            }

            const csvHeaders = Object.keys(results.data[0] || {});
            setHeaders(csvHeaders);

            // Auto-detect columns
            const autoMapping: FieldMap = {};
            csvHeaders.forEach((header) => {
              const lowerHeader = header.toLowerCase().replace(/\s+/g, "_");
              if (lowerHeader.includes("email")) {
                autoMapping.email = header;
              } else if (lowerHeader === "first_name" || lowerHeader === "firstname" || lowerHeader === "first") {
                autoMapping.first_name = header;
              } else if (lowerHeader === "last_name" || lowerHeader === "lastname" || lowerHeader === "last") {
                autoMapping.last_name = header;
              } else if (lowerHeader.includes("company") || lowerHeader.includes("org")) {
                autoMapping.company = header;
              }
            });

            setMapping(autoMapping);
            setLoading(false);
          },
          error: () => {
            setError("Failed to parse CSV file");
            setLoading(false);
          },
        });
      } catch (err: any) {
        setError(err.message || "Failed to load file");
        setLoading(false);
      }
    }

    loadFile();
  }, [router]);

  if (!workspaceId) {
    return null;
  }

  const handleContinue = () => {
    // Validate that email is mapped
    if (!mapping.email) {
      setError("Email column mapping is required");
      return;
    }

    // Store mapping in sessionStorage and redirect
    sessionStorage.setItem("onboarding_mapping", JSON.stringify(mapping));
    router.push("/onboarding/import-preview");
  };

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto my-10 p-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
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
        <h1 className="text-3xl font-semibold text-center">Map Your Columns</h1>
        <p className="text-center text-muted-foreground">
          Match your CSV columns to the fields we need. Email is required, everything else is optional.
        </p>
      </div>

      <div className="space-y-6">
        <ColumnMapper headers={headers} value={mapping} onChange={setMapping} />

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-center">
          <Button onClick={handleContinue} size="lg" className="min-w-[200px]">
            This looks good
          </Button>
        </div>
      </div>
    </div>
  );
}

