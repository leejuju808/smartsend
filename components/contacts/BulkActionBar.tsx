// Block 12800 — Bulk Action Bar Component
// Floating bottom bar that appears when contacts are selected

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/src/components/ui/select";
import { Input } from "@/components/ui/input";

interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
  isManagerOrOwner?: boolean;
}

export function BulkActionBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
  isManagerOrOwner = false,
}: BulkActionBarProps) {
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [showSuppressModal, setShowSuppressModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedCount = selectedIds.length;
  if (selectedCount === 0) return null;

  return (
    <>
      {/* Floating Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-sm font-medium">
            Selected: <span className="font-semibold">{selectedCount}</span> contact{selectedCount !== 1 ? "s" : ""}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddTagModal(true)}
            >
              Add Tag
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRemoveTagModal(true)}
            >
              Remove Tag
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStatusModal(true)}
            >
              Update Status
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowListModal(true)}
            >
              Move to List
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSuppressModal(true)}
            >
              Suppress
            </Button>
            {isManagerOrOwner && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddTagModal
        open={showAddTagModal}
        onOpenChange={setShowAddTagModal}
        onComplete={onActionComplete}
        selectedIds={selectedIds}
        loading={loading}
        setLoading={setLoading}
      />
      <RemoveTagModal
        open={showRemoveTagModal}
        onOpenChange={setShowRemoveTagModal}
        onComplete={onActionComplete}
        selectedIds={selectedIds}
        loading={loading}
        setLoading={setLoading}
      />
      <UpdateStatusModal
        open={showStatusModal}
        onOpenChange={setShowStatusModal}
        onComplete={onActionComplete}
        selectedIds={selectedIds}
        loading={loading}
        setLoading={setLoading}
      />
      <MoveToListModal
        open={showListModal}
        onOpenChange={setShowListModal}
        onComplete={onActionComplete}
        selectedIds={selectedIds}
        loading={loading}
        setLoading={setLoading}
      />
      <SuppressModal
        open={showSuppressModal}
        onOpenChange={setShowSuppressModal}
        onComplete={onActionComplete}
        selectedIds={selectedIds}
        loading={loading}
        setLoading={setLoading}
      />
      <DeleteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        onComplete={onActionComplete}
        selectedIds={selectedIds}
        loading={loading}
        setLoading={setLoading}
      />
    </>
  );
}

// Add Tag Modal
function AddTagModal({
  open,
  onOpenChange,
  onComplete,
  selectedIds,
  loading,
  setLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  selectedIds: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");

  // Fetch available tags
  useEffect(() => {
    if (open) {
      fetch("/api/tags")
        .then((res) => res.json())
        .then((data) => {
          if (data.tags) {
            setAvailableTags(data.tags.map((t: any) => t.tag || t.name || t));
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const handleSubmit = async () => {
    const tag = selectedTag || tagInput.trim();
    if (!tag) return;

    setLoading(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedIds,
          action: { type: "add_tag", tag },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onComplete();
        onOpenChange(false);
        setTagInput("");
        setSelectedTag("");
      } else {
        alert(data.error || "Failed to add tag");
      }
    } catch (error) {
      alert("Error adding tag");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Select existing tag</label>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a tag" />
                <SelectContent>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground text-center">OR</div>
          <div>
            <label className="text-sm font-medium mb-2 block">Type new tag</label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Enter tag name"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || (!selectedTag && !tagInput.trim())}>
            {loading ? "Adding..." : "Add Tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Remove Tag Modal
function RemoveTagModal({
  open,
  onOpenChange,
  onComplete,
  selectedIds,
  loading,
  setLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  selectedIds: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [selectedTag, setSelectedTag] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/tags")
        .then((res) => res.json())
        .then((data) => {
          if (data.tags) {
            setAvailableTags(data.tags.map((t: any) => t.tag || t.name || t));
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedTag) return;

    setLoading(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedIds,
          action: { type: "remove_tag", tag: selectedTag },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onComplete();
        onOpenChange(false);
        setSelectedTag("");
      } else {
        alert(data.error || "Failed to remove tag");
      }
    } catch (error) {
      alert("Error removing tag");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Select tag to remove</label>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a tag" />
                <SelectContent>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedTag} variant="destructive">
            {loading ? "Removing..." : "Remove Tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Update Status Modal
function UpdateStatusModal({
  open,
  onOpenChange,
  onComplete,
  selectedIds,
  loading,
  setLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  selectedIds: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [status, setStatus] = useState("");

  const statuses = [
    { value: "HOT", label: "HOT" },
    { value: "WARM", label: "WARM" },
    { value: "FOLLOW_UP", label: "FOLLOW UP" },
    { value: "NEW", label: "NEW" },
    { value: "NOT_INTERESTED", label: "NOT INTERESTED" },
    { value: "OUT_OF_SCOPE", label: "OUT OF SCOPE" },
  ];

  const handleSubmit = async () => {
    if (!status) return;

    setLoading(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedIds,
          action: { type: "update_status", status },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onComplete();
        onOpenChange(false);
        setStatus("");
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch (error) {
      alert("Error updating status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Select status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a status" />
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !status}>
            {loading ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Move to List Modal
function MoveToListModal({
  open,
  onOpenChange,
  onComplete,
  selectedIds,
  loading,
  setLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  selectedIds: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [listId, setListId] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [availableLists, setAvailableLists] = useState<Array<{ id: string; name: string }>>([]);
  const [newListName, setNewListName] = useState("");
  const [createNew, setCreateNew] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/contact-lists")
        .then((res) => res.json())
        .then((data) => {
          if (data.lists) {
            setAvailableLists(data.lists);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const handleSubmit = async () => {
    let targetListId = listId;

    // Create new list if needed
    if (createNew && newListName.trim()) {
      try {
        const createRes = await fetch("/api/contact-lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newListName.trim() }),
        });
        const createData = await createRes.json();
        if (!createData.ok) {
          alert(createData.error || "Failed to create list");
          return;
        }
        targetListId = createData.listId;
      } catch (error) {
        alert("Error creating list");
        return;
      }
    }

    if (!targetListId) return;

    setLoading(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedIds,
          action: { type: "move_to_list", listId: targetListId, duplicate },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onComplete();
        onOpenChange(false);
        setListId("");
        setNewListName("");
        setCreateNew(false);
        setDuplicate(false);
      } else {
        alert(data.error || "Failed to move contacts");
      }
    } catch (error) {
      alert("Error moving contacts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to List</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Select list</label>
            <Select value={listId} onValueChange={setListId} disabled={createNew}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a list" />
                <SelectContent>
                  {availableLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="create-new"
              checked={createNew}
              onChange={(e) => setCreateNew(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="create-new" className="text-sm">
              Create new list
            </label>
          </div>
          {createNew && (
            <div>
              <label className="text-sm font-medium mb-2 block">New list name</label>
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Enter list name"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="duplicate"
              checked={duplicate}
              onChange={(e) => setDuplicate(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="duplicate" className="text-sm">
              Keep in current lists (duplicate)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || (!listId && !createNew)}>
            {loading ? "Moving..." : duplicate ? "Copy to List" : "Move to List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress Modal
function SuppressModal({
  open,
  onOpenChange,
  onComplete,
  selectedIds,
  loading,
  setLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  selectedIds: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [reason, setReason] = useState("manual");

  const reasons = [
    { value: "manual", label: "Homeowner request" },
    { value: "unsubscribed", label: "Unsubscribed" },
    { value: "bounce", label: "Invalid emails" },
    { value: "out_of_scope", label: "Low-quality list" },
    { value: "manual", label: "Purchased list cleanup" },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedIds,
          action: { type: "suppress", reason },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onComplete();
        onOpenChange(false);
        setReason("manual");
      } else {
        alert(data.error || "Failed to suppress contacts");
      }
    } catch (error) {
      alert("Error suppressing contacts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suppress Contacts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will prevent these contacts from receiving future emails.
          </p>
          <div>
            <label className="text-sm font-medium mb-2 block">Reason</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} variant="destructive">
            {loading ? "Suppressing..." : "Suppress"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Delete Modal
function DeleteModal({
  open,
  onOpenChange,
  onComplete,
  selectedIds,
  loading,
  setLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  selectedIds: string[];
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const handleSubmit = async () => {
    if (!confirm("Are you sure you want to delete these contacts? This action cannot be undone.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedIds,
          action: { type: "delete" },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onComplete();
        onOpenChange(false);
      } else {
        alert(data.error || "Failed to delete contacts");
      }
    } catch (error) {
      alert("Error deleting contacts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Contacts</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete these contacts? This will remove them from all lists and prevent future sending.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} variant="destructive">
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


