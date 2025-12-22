"use client";

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { ResolveOrphanedReplyModal } from "./ResolveOrphanedReplyModal";

interface OrphanedReplyBannerProps {
  orphanedCount: number;
  onResolve?: () => void;
}

/**
 * Block 19700 — Orphaned Reply Banner
 * Shows a banner when there are orphaned replies that need attention
 */
export function OrphanedReplyBanner({ orphanedCount, onResolve }: OrphanedReplyBannerProps) {
  const [modalOpen, setModalOpen] = React.useState(false);

  if (orphanedCount === 0) return null;

  return (
    <>
      <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            ⚠️ {orphanedCount} reply{orphanedCount !== 1 ? "s" : ""} need{orphanedCount === 1 ? "s" : ""} attention (unmatched).
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="ml-4"
          >
            Click to assign
          </Button>
        </AlertDescription>
      </Alert>

      <ResolveOrphanedReplyModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onResolved={onResolve}
      />
    </>
  );
}



















































