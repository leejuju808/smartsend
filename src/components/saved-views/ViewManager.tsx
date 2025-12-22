"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/src/components/ui/select";
import {
  useCreateSavedView,
  useUpdateSavedView,
  useDeleteSavedView,
  useDuplicateSavedView,
  SavedView,
} from "@/hooks/useSavedViews";
import { useToast } from "@/components/ui/use-toast";

type ViewManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  entityType: SavedView["entity_type"];
  existingView?: SavedView | null;
  currentFilters?: any;
  currentSort?: any;
  currentHiddenColumns?: string[];
  onSave: () => void;
};

export function ViewManager({
  open,
  onOpenChange,
  mode,
  entityType,
  existingView,
  currentFilters,
  currentSort,
  currentHiddenColumns,
  onSave,
}: ViewManagerProps) {
  const { toast } = useToast();
  const createView = useCreateSavedView();
  const updateView = useUpdateSavedView();
  const deleteView = useDeleteSavedView();
  const duplicateView = useDuplicateSavedView();

  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (existingView) {
      setName(existingView.name);
      setShared(existingView.shared);
      setIsDefault(existingView.is_default);
      setCategory(existingView.category || "");
    } else {
      setName("");
      setShared(false);
      setIsDefault(false);
      setCategory("");
    }
  }, [existingView, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "View name is required",
        variant: "destructive",
      });
      return;
    }

    const config = {
      filters: currentFilters || [],
      sort: currentSort || [],
      hiddenColumns: currentHiddenColumns || [],
    };

    try {
      if (mode === "create") {
        await createView.mutateAsync({
          name: name.trim(),
          entity_type: entityType,
          config,
          shared,
          is_default: isDefault,
          category: category || undefined,
        });
        toast({
          title: "Success",
          description: "View created successfully",
        });
      } else if (existingView) {
        await updateView.mutateAsync({
          viewId: existingView.id,
          input: {
            name: name.trim(),
            config,
            shared,
            is_default: isDefault,
            category: category || undefined,
          },
        });
        toast({
          title: "Success",
          description: "View updated successfully",
        });
      }
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save view",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!existingView) return;
    if (!confirm(`Are you sure you want to delete "${existingView.name}"?`)) return;

    try {
      await deleteView.mutateAsync({
        viewId: existingView.id,
        entityType,
      });
      toast({
        title: "Success",
        description: "View deleted successfully",
      });
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete view",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async () => {
    if (!existingView) return;

    try {
      await duplicateView.mutateAsync({
        viewId: existingView.id,
        name: `${existingView.name} (Copy)`,
      });
      toast({
        title: "Success",
        description: "View duplicated successfully",
      });
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate view",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create Saved View" : "Edit Saved View"}</DialogTitle>
          <DialogDescription>
            Save your current filters, sort, and column visibility as a reusable view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="view-name">View Name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Hot Leads, Active Campaigns"
            />
          </div>

          <div>
            <Label htmlFor="view-category">Category (optional)</Label>
            <Input
              id="view-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., My Views, Team Views"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="shared"
              checked={shared}
              onCheckedChange={(checked) => setShared(checked === true)}
            />
            <Label htmlFor="shared" className="cursor-pointer">
              Share with workspace
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <Label htmlFor="default" className="cursor-pointer">
              Set as default view
            </Label>
          </div>

          {mode === "edit" && existingView && (
            <div className="pt-4 border-t space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicateView.isPending}
              >
                Duplicate View
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteView.isPending}
              >
                Delete View
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createView.isPending || updateView.isPending || !name.trim()}
          >
            {mode === "create" ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

