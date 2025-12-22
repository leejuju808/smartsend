"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/Button";
import { Download, RefreshCw, Eye } from "lucide-react";

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
  error_file_url: string | null;
};

export default function ImportsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkspaceAndData = async () => {
      try {
        // Get active workspace from localStorage
        const activeWorkspace = localStorage.getItem("active_workspace");
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
          await loadImports(activeWorkspace);
        } else {
          // Fallback: get user's first workspace
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
              setWorkspaceId(workspace.workspace_id);
              await loadImports(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error("Error loading workspace:", error);
      } finally {
        setLoading(false);
      }
    };

    loadWorkspaceAndData();
  }, [supabase]);

  async function loadImports(wsId: string) {
    try {
      const res = await fetch(`/api/imports/list?workspaceId=${wsId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch imports");
      }
      const data = await res.json();
      setImports(data);
    } catch (error) {
      console.error("Error loading imports:", error);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function downloadErrorFile(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `errors_${filename}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download error file");
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-sm text-muted-foreground">Loading imports...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage your CSV import history
          </p>
        </div>
        <Button
          onClick={() => router.push("/leads")}
          variant="outline"
        >
          Back to Leads
        </Button>
      </div>

      {imports.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">No imports yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Start by importing a CSV file from the Leads page
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Filename</TH>
                <TH>Uploaded By</TH>
                <TH>Date</TH>
                <TH>Success</TH>
                <TH>Failed</TH>
                <TH>Duplicates</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {imports.map((imp) => (
                <TR key={imp.id}>
                  <TD className="font-medium">{imp.filename}</TD>
                  <TD>{imp.uploaded_by}</TD>
                  <TD>{formatDate(imp.created_at)}</TD>
                  <TD>
                    <span className="text-green-600">{imp.success_rows}</span>
                  </TD>
                  <TD>
                    {imp.failed_rows > 0 ? (
                      <span className="text-red-600">{imp.failed_rows}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TD>
                  <TD>
                    {imp.duplicate_rows > 0 ? (
                      <span className="text-yellow-600">{imp.duplicate_rows}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/leads/imports/${imp.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {imp.error_file_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadErrorFile(imp.error_file_url!, imp.filename)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Errors
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}









