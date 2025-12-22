"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Badge } from "@/components/ui/Badge";
import { useQueuePreview } from "@/lib/hooks/useQueuePreview";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function QueuePreviewModal({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const pageSize = 50;

  const { data, loading } = useQueuePreview(campaignId, page, pageSize);

  const exportToCSV = React.useCallback(() => {
    if (!data?.leads) return;

    const headers = ["Name", "Email", "Company", "Status"];
    const rows = data.leads.map((l: any) => [
      `${l.first_name || ""} ${l.last_name || ""}`.trim() || "N/A",
      l.email || "N/A",
      l.company || "N/A",
      l.excluded || "OK",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `campaign-queue-preview-${campaignId}-page-${page}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [data, campaignId, page]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Preview Audience
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>Send Queue Preview</DialogTitle>
              {!loading && data && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCSV}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-6 py-4">
            {loading && (
              <div className="text-xs text-muted-foreground text-center py-8">
                Loading…
              </div>
            )}

            {!loading && data && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  {data.total} total leads
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="p-2 text-left font-medium">Name</th>
                        <th className="p-2 text-left font-medium">Email</th>
                        <th className="p-2 text-left font-medium">Company</th>
                        <th className="p-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leads.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground">
                            No leads found
                          </td>
                        </tr>
                      ) : (
                        data.leads.map((l: any) => (
                          <tr key={l.id} className="border-t hover:bg-muted/50">
                            <td className="p-2">
                              {l.first_name || l.last_name
                                ? `${l.first_name || ""} ${l.last_name || ""}`.trim()
                                : "N/A"}
                            </td>
                            <td className="p-2">{l.email || "N/A"}</td>
                            <td className="p-2">{l.company || "N/A"}</td>
                            <td className="p-2">
                              {l.excluded ? (
                                <Badge variant="destructive">{l.excluded}</Badge>
                              ) : (
                                <Badge>OK</Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {data.total > pageSize && (
                  <div className="flex justify-between items-center pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </Button>

                    <div className="text-xs text-muted-foreground">
                      Page {page} of {Math.ceil(data.total / pageSize)}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.leads.length < pageSize || page * pageSize >= data.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!loading && !data && (
              <div className="text-xs text-muted-foreground text-center py-8">
                Failed to load preview
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}












