"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Download, RefreshCw, ArrowLeft } from "lucide-react";

type ImportRecord = {
  id: string;
  filename: string;
  uploaded_by: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  enriched_rows: number;
  ignored_rows: number;
  created_at: string;
  mapping: any;
  error_file_url: string | null;
};

type ImportError = {
  id: string;
  row_data: any;
  error_message: string;
  created_at: string;
};

export default function ImportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const importId = params?.id as string;
  const supabase = createClientComponentClient();
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (importId) {
      loadImportData();
    }
  }, [importId]);

  async function loadImportData() {
    try {
      // Get workspace ID first
      const activeWorkspace = localStorage.getItem("active_workspace");
      if (!activeWorkspace) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: workspace } = await supabase
            .from("team_members")
            .select("workspace_id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle();
          if (workspace?.workspace_id) {
            await loadData(workspace.workspace_id);
          }
        }
      } else {
        await loadData(activeWorkspace);
      }
    } catch (error) {
      console.error("Error loading import data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadData(workspaceId: string) {
    try {
      // Load import record
      const importsRes = await fetch(`/api/imports/list?workspaceId=${workspaceId}`);
      if (importsRes.ok) {
        const importsData = await importsRes.json();
        const found = importsData.find((imp: ImportRecord) => imp.id === importId);
        if (found) {
          setImportRecord(found);
        }
      }

      // Load errors
      const errorsRes = await fetch(`/api/imports/${importId}/errors`);
      if (errorsRes.ok) {
        const errorsData = await errorsRes.json();
        setErrors(errorsData);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  }

  async function handleRetry() {
    if (!confirm("Retry all failed rows? This will attempt to import them again.")) {
      return;
    }

    setRetrying(true);
    try {
      const res = await fetch(`/api/imports/${importId}/retry`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to retry import");
      }

      const data = await res.json();
      alert(`Retried ${data.retried} rows. ${data.still_failed} still failed.`);
      
      // Reload data
      await loadImportData();
    } catch (error) {
      console.error("Error retrying import:", error);
      alert("Failed to retry import");
    } finally {
      setRetrying(false);
    }
  }

  function downloadErrorFile() {
    if (!importRecord?.error_file_url) return;
    
    try {
      const a = document.createElement("a");
      a.href = importRecord.error_file_url;
      a.download = `errors_${importRecord.filename}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download error file");
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-sm text-muted-foreground">Loading import details...</div>
      </div>
    );
  }

  if (!importRecord) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-red-600">Import not found</div>
        <Button onClick={() => router.push("/leads/imports")} variant="outline" className="mt-4">
          Back to Imports
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push("/leads/imports")}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Imports
          </Button>
          <h1 className="text-2xl font-semibold">{importRecord.filename}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uploaded by {importRecord.uploaded_by} on {formatDate(importRecord.created_at)}
          </p>
        </div>
        {importRecord.error_file_url && (
          <Button onClick={downloadErrorFile} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download Error CSV
          </Button>
        )}
      </div>

      {/* Summary Stats */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Import Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Rows</div>
            <div className="text-2xl font-semibold">{importRecord.total_rows}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Success</div>
            <div className="text-2xl font-semibold text-green-600">
              {importRecord.success_rows}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Failed</div>
            <div className="text-2xl font-semibold text-red-600">
              {importRecord.failed_rows}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Duplicates</div>
            <div className="text-2xl font-semibold text-yellow-600">
              {importRecord.duplicate_rows}
            </div>
          </div>
        </div>
        {(importRecord.enriched_rows > 0 || importRecord.ignored_rows > 0) && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {importRecord.enriched_rows > 0 && (
              <div>
                <div className="text-sm text-muted-foreground">Enriched</div>
                <div className="text-xl font-semibold">{importRecord.enriched_rows}</div>
              </div>
            )}
            {importRecord.ignored_rows > 0 && (
              <div>
                <div className="text-sm text-muted-foreground">Ignored</div>
                <div className="text-xl font-semibold">{importRecord.ignored_rows}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Mapping Used */}
      {importRecord.mapping && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Column Mapping</h2>
          <div className="space-y-2">
            {Object.entries(importRecord.mapping).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{key}:</span>
                <span className="text-muted-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Failed Rows */}
      {errors.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Failed Rows ({errors.length})</h2>
            <Button
              onClick={handleRetry}
              disabled={retrying}
              variant="default"
            >
              {retrying ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Failed Rows
                </>
              )}
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Row Data</TH>
                  <TH>Error</TH>
                </TR>
              </THead>
              <TBody>
                {errors.map((error) => (
                  <TR key={error.id}>
                    <TD>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-w-md">
                        {JSON.stringify(error.row_data, null, 2)}
                      </pre>
                    </TD>
                    <TD>
                      <span className="text-red-600 text-sm">{error.error_message}</span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      {errors.length === 0 && importRecord.failed_rows === 0 && (
        <Card className="p-6">
          <p className="text-muted-foreground text-center">
            No errors! All rows imported successfully.
          </p>
        </Card>
      )}
    </div>
  );
}









