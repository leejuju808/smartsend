"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterState } from "./filter-builder";

type SaveFilterModalProps = {
  open: boolean;
  onClose: () => void;
  filter: FilterState;
  context: "inbox" | "leads" | "pipeline" | "campaigns";
  workspaceId?: string;
  onSaved?: () => void;
};

export function SaveFilterModal({
  open,
  onClose,
  filter,
  context,
  workspaceId,
  onSaved,
}: SaveFilterModalProps) {
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setShared(false);
    }
  }, [open]);

  async function save() {
    if (!name.trim()) {
      alert("Please enter a filter name");
      return;
    }

    if (!workspaceId) {
      alert("Workspace not found");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/saved-filters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          context,
          filter,
          shared,
          workspace_id: workspaceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save filter");
      }

      onSaved?.();
      onClose();
    } catch (error: any) {
      console.error("Error saving filter:", error);
      alert(error.message || "Failed to save filter");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="p-6 space-y-4 max-w-md">
        <DialogHeader>
          <DialogTitle>Save Filter</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="filter-name">Filter Name</Label>
            <Input
              id="filter-name"
              placeholder="e.g., Hot Leads, Needs Follow-Up"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  save();
                }
              }}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="shared"
              checked={shared}
              onCheckedChange={(checked) => setShared(checked === true)}
            />
            <Label htmlFor="shared" className="font-normal cursor-pointer">
              Share with team
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

