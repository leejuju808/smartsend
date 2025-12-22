// Block 9400 — Bulk Actions Engine
// Bulk action bar component for contacts

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/Input";

interface BulkActionBarProps {
  selectedCount: number;
  onStatusChange: (status: string) => Promise<void>;
  onAddTags: (tags: string[]) => Promise<void>;
  onRemoveTags: (tags: string[]) => Promise<void>;
  onAssignOwner: (ownerId: string) => Promise<void>;
  onSuppress: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  onStatusChange,
  onAddTags,
  onRemoveTags,
  onAssignOwner,
  onSuppress,
  onDelete,
  onClearSelection,
}: BulkActionBarProps) {
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [addTagsModalOpen, setAddTagsModalOpen] = useState(false);
  const [removeTagsModalOpen, setRemoveTagsModalOpen] = useState(false);
  const [assignOwnerModalOpen, setAssignOwnerModalOpen] = useState(false);
  const [suppressModalOpen, setSuppressModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [ownerId, setOwnerId] = useState("");

  if (selectedCount === 0) return null;

  const handleStatusSubmit = async () => {
    if (!selectedStatus) return;
    await onStatusChange(selectedStatus);
    setStatusModalOpen(false);
    setSelectedStatus("");
  };

  const handleAddTagsSubmit = async () => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    await onAddTags(tags);
    setAddTagsModalOpen(false);
    setTagsInput("");
  };

  const handleRemoveTagsSubmit = async () => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    await onRemoveTags(tags);
    setRemoveTagsModalOpen(false);
    setTagsInput("");
  };

  const handleAssignOwnerSubmit = async () => {
    if (!ownerId) return;
    await onAssignOwner(ownerId);
    setAssignOwnerModalOpen(false);
    setOwnerId("");
  };

  const handleSuppressConfirm = async () => {
    await onSuppress();
    setSuppressModalOpen(false);
  };

  const handleDeleteConfirm = async () => {
    await onDelete();
    setDeleteModalOpen(false);
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
            <Button variant="outline" size="sm" onClick={() => setStatusModalOpen(true)}>
              Change Status
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddTagsModalOpen(true)}>
              Add Tags
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRemoveTagsModalOpen(true)}>
              Remove Tags
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAssignOwnerModalOpen(true)}>
              Assign Owner
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSuppressModalOpen(true)}>
              Suppress
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteModalOpen(true)}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Status Modal */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Attempting">Attempting</SelectItem>
                <SelectItem value="Warm">Warm</SelectItem>
                <SelectItem value="Hot">Hot</SelectItem>
                <SelectItem value="Customer">Customer</SelectItem>
                <SelectItem value="Not Interested">Not Interested</SelectItem>
              </SelectTrigger>
            </Select>
            <p className="text-sm text-muted-foreground">
              Apply to {selectedCount} contact{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatusSubmit}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tags Modal */}
      <Dialog open={addTagsModalOpen} onOpenChange={setAddTagsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Enter tags separated by commas"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Add these tags to {selectedCount} contact{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTagsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTagsSubmit}>Add Tags</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Tags Modal */}
      <Dialog open={removeTagsModalOpen} onOpenChange={setRemoveTagsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Enter tags to remove, separated by commas"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Remove these tags from {selectedCount} contact{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTagsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRemoveTagsSubmit}>Remove Tags</Button>
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
              Assign owner to {selectedCount} contact{selectedCount !== 1 ? "s" : ""}
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

      {/* Suppress Confirmation Modal */}
      <Dialog open={suppressModalOpen} onOpenChange={setSuppressModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress Contacts</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Are you sure you want to suppress {selectedCount} contact{selectedCount !== 1 ? "s" : ""}? They will be added to the Do-Not-Send list.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuppressModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSuppressConfirm}>
              Suppress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contacts</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Are you sure you want to delete {selectedCount} contact{selectedCount !== 1 ? "s" : ""}? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

