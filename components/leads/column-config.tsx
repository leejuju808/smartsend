"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnConfig = {
  id: string;
  label: string;
  visible: boolean;
  order: number;
};

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "first_name", label: "First Name", visible: true, order: 0 },
  { id: "last_name", label: "Last Name", visible: true, order: 1 },
  { id: "email", label: "Email", visible: true, order: 2 },
  { id: "company", label: "Company", visible: true, order: 3 },
  { id: "title", label: "Title", visible: true, order: 4 },
  { id: "tags", label: "Tags", visible: true, order: 5 },
  { id: "score", label: "Score", visible: true, order: 6 },
  { id: "owner", label: "Owner", visible: true, order: 7 },
  { id: "reachability", label: "Reachability", visible: true, order: 8 },
  { id: "created_at", label: "Created At", visible: false, order: 9 },
  { id: "last_activity", label: "Last Activity", visible: false, order: 10 },
  { id: "campaigns_count", label: "Campaigns Count", visible: false, order: 11 },
  { id: "reply_count", label: "Reply Count", visible: false, order: 12 },
];

export const COLUMN_PRESETS: Record<string, ColumnConfig[]> = {
  outbound: [
    { id: "first_name", label: "First Name", visible: true, order: 0 },
    { id: "last_name", label: "Last Name", visible: true, order: 1 },
    { id: "email", label: "Email", visible: true, order: 2 },
    { id: "company", label: "Company", visible: true, order: 3 },
    { id: "title", label: "Title", visible: true, order: 4 },
    { id: "score", label: "Score", visible: true, order: 5 },
    { id: "reachability", label: "Reachability", visible: true, order: 6 },
    { id: "last_activity", label: "Last Activity", visible: true, order: 7 },
  ],
  research: [
    { id: "email", label: "Email", visible: true, order: 0 },
    { id: "company", label: "Company", visible: true, order: 1 },
    { id: "website", label: "Website", visible: true, order: 2 },
    { id: "linkedin", label: "LinkedIn", visible: true, order: 3 },
    { id: "industry", label: "Industry", visible: true, order: 4 },
    { id: "size", label: "Size", visible: true, order: 5 },
  ],
  enrichment: [
    { id: "email", label: "Email", visible: true, order: 0 },
    { id: "company", label: "Company", visible: true, order: 1 },
    { id: "domain", label: "Domain", visible: true, order: 2 },
    { id: "enriched_fields", label: "Enriched Fields", visible: true, order: 3 },
  ],
};

interface ColumnConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnConfig[];
  onSave: (columns: ColumnConfig[]) => void;
  onPresetSelect?: (preset: ColumnConfig[]) => void;
}

export function ColumnConfigPanel({ open, onOpenChange, columns: initialColumns, onSave, onPresetSelect }: ColumnConfigPanelProps) {
  const [columns, setColumns] = useState<ColumnConfig[]>(initialColumns.length > 0 ? initialColumns : DEFAULT_COLUMNS);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && initialColumns.length > 0) {
      setColumns(initialColumns);
    }
  }, [open, initialColumns]);

  const handleToggle = (id: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, visible: !col.visible } : col))
    );
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const newColumns = [...columns];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newColumns.length) return;

    [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];
    
    // Update order values
    newColumns.forEach((col, idx) => {
      col.order = idx;
    });

    setColumns(newColumns);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    if (draggedIndex !== index) {
      const newColumns = [...columns];
      const dragged = newColumns[draggedIndex];
      newColumns.splice(draggedIndex, 1);
      newColumns.splice(index, 0, dragged);
      
      // Update order values
      newColumns.forEach((col, idx) => {
        col.order = idx;
      });

      setColumns(newColumns);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = () => {
    onSave(columns);
    onOpenChange(false);
  };

  const visibleColumns = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);
  const hiddenColumns = columns.filter((c) => !c.visible).sort((a, b) => a.order - b.order);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Configure Columns</SheetTitle>
          <SheetDescription>
            Toggle column visibility and drag to reorder. Changes are saved automatically.
          </SheetDescription>
        </SheetHeader>

        {/* Presets */}
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Presets</h3>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const preset = COLUMN_PRESETS.outbound;
                setColumns(preset);
                onPresetSelect?.(preset);
              }}
            >
              Outbound
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const preset = COLUMN_PRESETS.research;
                setColumns(preset);
                onPresetSelect?.(preset);
              }}
            >
              Research
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const preset = COLUMN_PRESETS.enrichment;
                setColumns(preset);
                onPresetSelect?.(preset);
              }}
            >
              Enrichment
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* Visible Columns */}
          <div>
            <h3 className="text-sm font-medium mb-2">Visible Columns</h3>
            <div className="space-y-1">
              {visibleColumns.map((col, index) => (
                <div
                  key={col.id}
                  draggable
                  onDragStart={() => handleDragStart(columns.findIndex((c) => c.id === col.id))}
                  onDragOver={(e) => handleDragOver(e, columns.findIndex((c) => c.id === col.id))}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent cursor-move",
                    draggedIndex === columns.findIndex((c) => c.id === col.id) && "opacity-50"
                  )}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Checkbox
                    checked={col.visible}
                    onCheckedChange={() => handleToggle(col.id)}
                  />
                  <span className="flex-1 text-sm">{col.label}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleMove(columns.findIndex((c) => c.id === col.id), "up")}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-background disabled:opacity-50"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleMove(columns.findIndex((c) => c.id === col.id), "down")}
                      disabled={index === visibleColumns.length - 1}
                      className="p-1 rounded hover:bg-background disabled:opacity-50"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hidden Columns */}
          {hiddenColumns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Hidden Columns</h3>
              <div className="space-y-1">
                {hiddenColumns.map((col) => (
                  <div
                    key={col.id}
                    className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent"
                  >
                    <div className="w-4" /> {/* Spacer for alignment */}
                    <Checkbox
                      checked={col.visible}
                      onCheckedChange={() => handleToggle(col.id)}
                    />
                    <span className="flex-1 text-sm text-muted-foreground">{col.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

