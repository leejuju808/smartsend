"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/src/components/ui/select";
import { useSavedViews, SavedView } from "@/hooks/useSavedViews";
import { ChevronDown, Plus, Settings } from "lucide-react";
import { ViewManager } from "./ViewManager";

type ViewSelectorProps = {
  entityType: SavedView["entity_type"];
  currentViewId?: string | null;
  onSelectView: (view: SavedView | null) => void;
  currentFilters?: any;
  currentSort?: any;
  currentHiddenColumns?: string[];
};

export function ViewSelector({
  entityType,
  currentViewId,
  onSelectView,
  currentFilters,
  currentSort,
  currentHiddenColumns,
}: ViewSelectorProps) {
  const { data: views = [], isLoading, mutate } = useSavedViews(entityType);
  const [showManager, setShowManager] = useState(false);
  const [managerMode, setManagerMode] = useState<"create" | "edit" | null>(null);
  const [editingView, setEditingView] = useState<SavedView | null>(null);

  // Find current view
  const currentView = views.find((v) => v.id === currentViewId) || null;

  // Group views by category
  const groupedViews = views.reduce((acc, view) => {
    const category = view.category || "My Views";
    if (!acc[category]) acc[category] = [];
    acc[category].push(view);
    return acc;
  }, {} as Record<string, SavedView[]>);

  const handleSelectView = (viewId: string) => {
    if (viewId === "none") {
      onSelectView(null);
      return;
    }
    const view = views.find((v) => v.id === viewId);
    if (view) {
      onSelectView(view);
    }
  };

  const handleCreateView = () => {
    setEditingView(null);
    setManagerMode("create");
    setShowManager(true);
  };

  const handleEditView = (view: SavedView) => {
    setEditingView(view);
    setManagerMode("edit");
    setShowManager(true);
  };

  const handleSaveView = () => {
    setShowManager(false);
    // Trigger refetch
    mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Select value={currentViewId || "none"} onValueChange={handleSelectView}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Loading views..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Select value={currentViewId || "none"} onValueChange={handleSelectView}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a view">
              {currentView ? currentView.name : "All " + entityType}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">All {entityType}</SelectItem>
            {Object.entries(groupedViews).map(([category, categoryViews]) => 
              categoryViews.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  [{category}] {view.name}
                  {view.is_default && " (Default)"}
                  {view.shared && " 🔗"}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {currentView && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditView(currentView)}
            title="Edit view"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={handleCreateView}>
          <Plus className="h-4 w-4 mr-1" />
          Save View
        </Button>
      </div>

      {showManager && (
        <ViewManager
          open={showManager}
          onOpenChange={setShowManager}
          mode={managerMode || "create"}
          entityType={entityType}
          existingView={editingView}
          currentFilters={currentFilters}
          currentSort={currentSort}
          currentHiddenColumns={currentHiddenColumns}
          onSave={handleSaveView}
        />
      )}
    </>
  );
}

