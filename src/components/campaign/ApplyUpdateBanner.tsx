"use client";

import * as React from "react";
import { DiffViewer, type LibraryDiff } from "@/components/library/DiffViewer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type UpdateStatus = {
  mode: "clone" | "inherit";
  currentVersion: number;
  adoptedVersion: number;
  hasUpdate: boolean;
};

type ApplyUpdateBannerProps = {
  resourceId: string;
  campaignId: string;
};

export function ApplyUpdateBanner({ resourceId, campaignId }: ApplyUpdateBannerProps) {
  const [status, setStatus] = React.useState<UpdateStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [diffLoading, setDiffLoading] = React.useState(false);
  const [diffOpen, setDiffOpen] = React.useState(false);
  const [diff, setDiff] = React.useState<LibraryDiff | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/library/${resourceId}/update-status?campaignId=${campaignId}`);
        if (!res.ok) {
          return;
        }
        const data: UpdateStatus = await res.json();
        if (cancelled) {
          return;
        }
        setStatus(data);
        setShow(data.mode === "clone" && data.hasUpdate);
      } catch (error) {
        console.error("Failed to load update status", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaignId, resourceId]);

  const hasVisibleUpdate = show && status?.hasUpdate && status.mode === "clone";

  if (!hasVisibleUpdate || !status) {
    return null;
  }

  const handleApply = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/library/${resourceId}/apply-update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to apply update");
      }

      setStatus((prev) =>
        prev
          ? {
              ...prev,
              hasUpdate: false,
              adoptedVersion: prev.currentVersion,
            }
          : prev,
      );
      setShow(false);
      setDiff(null);
    } catch (error) {
      console.error("Failed to apply update", error);
      alert(error instanceof Error ? error.message : "Failed to apply update");
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await fetch("/api/alerts/dismiss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, kind: "library_update" }),
      });
    } catch (error) {
      console.error("Failed to dismiss alert", error);
    } finally {
      setShow(false);
    }
  };

  const handleViewDiff = async () => {
    if (!status) return;
    setDiffLoading(true);
    try {
      const res = await fetch(
        `/api/library/${resourceId}/diff?from=${status.adoptedVersion}&to=${status.currentVersion}`,
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load diff");
      }
      const data: { diff: LibraryDiff } = await res.json();
      setDiff(data.diff);
      setDiffOpen(true);
    } catch (error) {
      console.error("Failed to load diff", error);
      alert(error instanceof Error ? error.message : "Failed to load diff");
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <>
      <Card className="border-primary/40 bg-primary/5">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Update available</Badge>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Clone adoption</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Applying will move from{" "}
              <span className="font-semibold text-foreground">v{status.adoptedVersion}</span> to{" "}
              <span className="font-semibold text-foreground">v{status.currentVersion}</span>.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={diffLoading} onClick={handleViewDiff}>
              {diffLoading ? "Loading…" : "View diff"}
            </Button>
            <Button size="sm" onClick={handleApply} disabled={busy}>
              {busy ? "Applying…" : "Apply update"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={busy}>
              Dismiss
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Library update diff</DialogTitle>
            <DialogDescription>
              Comparing v{status.adoptedVersion} → v{status.currentVersion}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-96 overflow-y-auto rounded-md border border-dashed border-muted/60 bg-muted/10 p-3">
            <DiffViewer diff={diff} />
          </div>

          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setDiffOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


