// Block 9400 — Bulk Actions Engine
// Bulk action bar component for replies

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/Input";

interface BulkActionBarProps {
  selectedCount: number;
  onMarkRead: () => Promise<void>;
  onMarkUnread: () => Promise<void>;
  onArchive: () => Promise<void>;
  onChangeIntent: (intent: "hot" | "warm" | "follow_up" | "not_interested") => Promise<void>;
  onAssignOwner: (ownerId: string) => Promise<void>;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onChangeIntent,
  onAssignOwner,
  onClearSelection,
}: BulkActionBarProps) {
  const [intentModalOpen, setIntentModalOpen] = useState(false);
  const [assignOwnerModalOpen, setAssignOwnerModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);

  const [selectedIntent, setSelectedIntent] = useState<"hot" | "warm" | "follow_up" | "not_interested">("hot");
  const [ownerId, setOwnerId] = useState("");

  if (selectedCount === 0) return null;

  const handleIntentSubmit = async () => {
    await onChangeIntent(selectedIntent);
    setIntentModalOpen(false);
  };

  const handleAssignOwnerSubmit = async () => {
    if (!ownerId) return;
    await onAssignOwner(ownerId);
    setAssignOwnerModalOpen(false);
    setOwnerId("");
  };

  const handleArchiveConfirm = async () => {
    await onArchive();
    setArchiveModalOpen(false);
  };

  return (
    <>
      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              Clear
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onMarkRead}>
              Mark as Read
            </Button>
            <Button variant="outline" size="sm" onClick={onMarkUnread}>
              Mark as Unread
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIntentModalOpen(true)}>
              Change Intent
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAssignOwnerModalOpen(true)}>
              Assign Owner
            </Button>
            <Button variant="outline" size="sm" onClick={() => setArchiveModalOpen(true)}>
              Archive
            </Button>
          </div>
        </div>
      </div>

      {/* Intent Modal */}
      <Dialog open={intentModalOpen} onOpenChange={setIntentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Intent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedIntent} onValueChange={(v: any) => setSelectedIntent(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select intent" />
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
              </SelectTrigger>
            </Select>
            <p className="text-sm text-muted-foreground">
              Apply to {selectedCount} thread{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntentModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleIntentSubmit}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Owner Modal */}
      <Dialog open={assignOwnerModalOpen} onOpenChange={setAssignOwnerModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Owner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Enter owner user ID"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Assign owner to {selectedCount} thread{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOwnerModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignOwnerSubmit}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Modal */}
      <Dialog open={archiveModalOpen} onOpenChange={setArchiveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Threads</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Are you sure you want to archive {selectedCount} thread{selectedCount !== 1 ? "s" : ""}?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchiveConfirm}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

