"use client";

import { useState, useEffect } from "react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { QuickFilters } from "./quick-filters";
import { ColumnConfig } from "./column-config";

export type SavedView = {
  id: string;
  name: string;
  filters: QuickFilters;
  columns: ColumnConfig[];
  sort?: { key: string; ascending: boolean };
};

interface SavedViewsDropdownProps {
  views: SavedView[];
  currentViewId?: string;
  onSelectView: (viewId: string | null) => void;
  onSaveView: (name: string, filters: QuickFilters, columns: ColumnConfig[], sort?: { key: string; ascending: boolean }) => Promise<void>;
  onDeleteView: (viewId: string) => Promise<void>;
  currentFilters: QuickFilters;
  currentColumns: ColumnConfig[];
  currentSort?: { key: string; ascending: boolean };
}

export function SavedViewsDropdown({
  views,
  currentViewId,
  onSelectView,
  onSaveView,
  onDeleteView,
  currentFilters,
  currentColumns,
  currentSort,
}: SavedViewsDropdownProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveAsNew = async () => {
    if (!viewName.trim()) return;
    setSaving(true);
    try {
      await onSaveView(viewName.trim(), currentFilters, currentColumns, currentSort);
      setViewName("");
      setSaveDialogOpen(false);
    } catch (error) {
      console.error("Failed to save view:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCurrent = async () => {
    if (!currentViewId) return;
    setSaving(true);
    try {
      const currentView = views.find((v) => v.id === currentViewId);
      if (currentView) {
        await onSaveView(currentView.name, currentFilters, currentColumns, currentSort);
      }
    } catch (error) {
      console.error("Failed to update view:", error);
    } finally {
      setSaving(false);
    }
  };

  const currentView = currentViewId ? views.find((v) => v.id === currentViewId) : null;

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={currentViewId || ""}
          onValueChange={(value) => onSelectView(value || null)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="View: Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Default</SelectItem>
            {views.map((view) => (
              <SelectItem key={view.id} value={view.id}>
                {view.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {currentViewId && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpdateCurrent}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeleteView(currentViewId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Save as New
        </Button>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">View Name</label>
              <Input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="e.g., High Intent Leads"
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && viewName.trim()) {
                    handleSaveAsNew();
                  }
                }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              This will save your current filters, column configuration, and sorting.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAsNew} disabled={!viewName.trim() || saving}>
              {saving ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

