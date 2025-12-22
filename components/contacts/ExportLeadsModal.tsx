"use client";

// Block 12500 — SmartSend Roofing Lead Export v1
// Export modal with async processing and status tracking

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

interface ExportLeadsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportScope = "all" | "hot" | "warm" | "custom";

interface ExportStatus {
  id: string;
  status: "pending" | "processing" | "complete" | "failed";
  file_url?: string;
  requested_at: string;
  completed_at?: string;
  expires_at?: string;
  row_count?: number;
  error_message?: string;
  is_expired?: boolean;
}

export function ExportLeadsModal({ open, onOpenChange }: ExportLeadsModalProps) {
  const [scope, setScope] = useState<ExportScope>("all");
  const [customStatus, setCustomStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [currentExport, setCurrentExport] = useState<ExportStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

  // Poll for export status when we have a pending/processing export
  useEffect(() => {
    if (!open || !currentExport || currentExport.status === "complete" || currentExport.status === "failed") {
      setPolling(false);
      return;
    }

    if (currentExport.status === "pending" || currentExport.status === "processing") {
      setPolling(true);
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/exports/${currentExport.id}`);
          const data = await res.json();
          if (data.ok && data.export) {
            setCurrentExport(data.export);
            if (data.export.status === "complete") {
              setPolling(false);
              toast({
                title: "Export ready!",
                description: "Your CSV file is ready to download.",
              });
            } else if (data.export.status === "failed") {
              setPolling(false);
              toast({
                variant: "destructive",
                title: "Export failed",
                description: data.export.error_message || "Failed to generate export",
              });
            }
          }
        } catch (error) {
          console.error("Error polling export status:", error);
        }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(interval);
    }
  }, [currentExport, open, toast]);

  async function handleExport() {
    setSubmitting(true);
    try {
      const filters: any = {
        scope,
      };

      if (scope === "custom" && customStatus) {
        filters.status = customStatus;
      }

      if (dateFrom) {
        filters.dateFrom = dateFrom;
      }

      if (dateTo) {
        filters.dateTo = dateTo;
      }

      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create export");
      }

      if (data.ok && data.export) {
        setCurrentExport({
          id: data.export.id,
          status: data.export.status,
          requested_at: data.export.requested_at,
        });

        toast({
          title: "Export started",
          description: "Your export is being processed. You'll be notified when it's ready.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error.message || "Failed to start export",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownload() {
    if (currentExport?.file_url) {
      window.open(currentExport.file_url, "_blank");
    }
  }

  function handleClose() {
    setCurrentExport(null);
    setScope("all");
    setCustomStatus("");
    setDateFrom("");
    setDateTo("");
    setPolling(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Leads</DialogTitle>
          <DialogDescription>
            Export your leads to CSV. The file will be generated in the background and you'll receive a download link when it's ready.
          </DialogDescription>
        </DialogHeader>

        {currentExport && currentExport.status !== "complete" && currentExport.status !== "failed" ? (
          // Show status while processing
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                <div>
                  <div className="font-medium">
                    {currentExport.status === "pending" ? "Queued" : "Processing"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Your export is being generated. This may take a few minutes...
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : currentExport && currentExport.status === "complete" ? (
          // Show download option when complete
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950">
              <div className="flex items-center gap-3">
                <div className="text-green-600 dark:text-green-400">✓</div>
                <div>
                  <div className="font-medium text-green-900 dark:text-green-100">
                    Export ready!
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300">
                    {currentExport.row_count ? `${currentExport.row_count} leads exported` : "Your CSV file is ready to download"}
                  </div>
                </div>
              </div>
            </div>
            {currentExport.is_expired && (
              <div className="text-sm text-muted-foreground">
                Note: This download link has expired. Please create a new export.
              </div>
            )}
          </div>
        ) : currentExport && currentExport.status === "failed" ? (
          // Show error
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950">
              <div className="font-medium text-red-900 dark:text-red-100">Export failed</div>
              <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                {currentExport.error_message || "An error occurred while generating your export"}
              </div>
            </div>
          </div>
        ) : (
          // Show export form
          <div className="space-y-6 py-4">
            {/* Data Scope */}
            <div className="space-y-2">
              <Label htmlFor="scope">Choose data scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ExportScope)}>
                <SelectTrigger id="scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All leads</SelectItem>
                  <SelectItem value="hot">Only HOT leads</SelectItem>
                  <SelectItem value="warm">Only WARM leads</SelectItem>
                  <SelectItem value="custom">Custom filter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Status Filter */}
            {scope === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="customStatus">Lead Status</Label>
                <Select value={customStatus} onValueChange={setCustomStatus}>
                  <SelectTrigger id="customStatus">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="attempting">Attempting</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date Range */}
            <div className="space-y-4">
              <Label>Custom date range (optional)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateFrom" className="text-xs">From</Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateTo" className="text-xs">To</Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground border-t pt-4">
              <p className="font-medium mb-1">What's included:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Homeowner email, name, city, state, ZIP</li>
                <li>Tags, lead status, dates</li>
                <li>Last reply snippet (not full threads)</li>
                <li>Assigned team member</li>
                <li>Campaign origin</li>
              </ul>
              <p className="font-medium mt-3 mb-1">What's NOT included:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Full email text bodies</li>
                <li>Follow-up templates</li>
                <li>AI classifications or automation logic</li>
                <li>Internal tasks or system events</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          {currentExport && currentExport.status === "complete" && !currentExport.is_expired ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleDownload}>
                Download CSV
              </Button>
            </>
          ) : currentExport && (currentExport.status === "pending" || currentExport.status === "processing") ? (
            <Button variant="outline" onClick={handleClose} disabled>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={submitting || (scope === "custom" && !customStatus)}>
                {submitting ? "Creating..." : "Generate CSV"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}





















































