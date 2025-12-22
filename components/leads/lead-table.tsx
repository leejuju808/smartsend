"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { ColumnConfig } from "./column-config";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

export type Lead = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  linkedin: string | null;
  tags: string[] | null;
  owner_id: string | null;
  score: number | null;
  score_bucket: string | null;
  reachability: string | null;
  created_at: string;
  last_activity_at: string | null;
  campaigns_count?: number;
  reply_count?: number;
};

interface LeadTableProps {
  leads: Lead[];
  columns: ColumnConfig[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onLeadUpdate: (leadId: string, updates: Partial<Lead>) => Promise<void>;
  onColumnResize?: (columnId: string, width: number) => void;
  onColumnReorder?: (columns: ColumnConfig[]) => void;
  stickyHeader?: boolean;
  stickyFirstColumn?: boolean;
  className?: string;
}

export function LeadTable({
  leads,
  columns,
  selectedIds,
  onSelectionChange,
  onLeadUpdate,
  onColumnResize,
  onColumnReorder,
  stickyHeader = true,
  stickyFirstColumn = true,
  className,
}: LeadTableProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible).sort((a, b) => a.order - b.order),
    [columns]
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        onSelectionChange(leads.map((l) => l.id));
      } else {
        onSelectionChange([]);
      }
    },
    [leads, onSelectionChange]
  );

  const handleSelectRow = useCallback(
    (leadId: string, checked: boolean) => {
      if (checked) {
        onSelectionChange([...selectedIds, leadId]);
      } else {
        onSelectionChange(selectedIds.filter((id) => id !== leadId));
      }
    },
    [selectedIds, onSelectionChange]
  );

  const handleCellDoubleClick = useCallback((rowId: string, columnId: string, value: any) => {
    setEditingCell({ rowId, columnId });
    setEditValue(value?.toString() || "");
  }, []);

  const handleCellBlur = useCallback(async () => {
    if (!editingCell) return;

    const lead = leads.find((l) => l.id === editingCell.rowId);
    if (!lead) return;

    const updates: Partial<Lead> = {};
    const columnId = editingCell.columnId;

    // Map column IDs to lead fields
    if (columnId === "first_name") updates.first_name = editValue || null;
    else if (columnId === "last_name") updates.last_name = editValue || null;
    else if (columnId === "email") updates.email = editValue || null;
    else if (columnId === "company") updates.company = editValue || null;
    else if (columnId === "title") updates.title = editValue || null;
    else if (columnId === "phone") updates.phone = editValue || null;
    else if (columnId === "linkedin") updates.linkedin = editValue || null;

    if (Object.keys(updates).length > 0) {
      await onLeadUpdate(editingCell.rowId, updates);
    }

    setEditingCell(null);
    setEditValue("");
  }, [editingCell, editValue, leads, onLeadUpdate]);

  const handleResizeStart = useCallback((columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setResizingColumn(columnId);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnId] || 150;
  }, [columnWidths]);

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizingColumn) return;
      const diff = e.clientX - resizeStartX.current;
      const newWidth = Math.max(50, resizeStartWidth.current + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
      onColumnResize?.(resizingColumn, newWidth);
    },
    [resizingColumn, resizeStartX, onColumnResize]
  );

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      return () => {
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [resizingColumn, handleResizeMove, handleResizeEnd]);

  const renderCellContent = useCallback(
    (lead: Lead, column: ColumnConfig) => {
      const isEditing = editingCell?.rowId === lead.id && editingCell?.columnId === column.id;
      const columnId = column.id;

      if (isEditing && ["first_name", "last_name", "email", "company", "title", "phone", "linkedin"].includes(columnId)) {
        return (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCellBlur();
              } else if (e.key === "Escape") {
                setEditingCell(null);
                setEditValue("");
              }
            }}
            autoFocus
            className="h-8"
          />
        );
      }

      let value: any = null;
      switch (columnId) {
        case "first_name":
          value = lead.first_name;
          break;
        case "last_name":
          value = lead.last_name;
          break;
        case "email":
          value = lead.email;
          break;
        case "company":
          value = lead.company;
          break;
        case "title":
          value = lead.title;
          break;
        case "tags":
          value = lead.tags;
          break;
        case "score":
          value = lead.score;
          break;
        case "owner":
          value = lead.owner_id;
          break;
        case "reachability":
          value = lead.reachability;
          break;
        case "created_at":
          value = lead.created_at;
          break;
        case "last_activity":
          value = lead.last_activity_at;
          break;
        case "campaigns_count":
          value = lead.campaigns_count;
          break;
        case "reply_count":
          value = lead.reply_count;
          break;
      }

      // Format display
      if (columnId === "tags" && Array.isArray(value)) {
        return (
          <div className="flex gap-1 flex-wrap">
            {value.map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 text-xs bg-muted rounded">
                {tag}
              </span>
            ))}
          </div>
        );
      }

      if (columnId === "score" && typeof value === "number") {
        return (
          <span className={cn(
            "px-2 py-1 rounded text-xs font-medium",
            value >= 80 ? "bg-red-100 text-red-800" :
            value >= 50 ? "bg-orange-100 text-orange-800" :
            value >= 20 ? "bg-yellow-100 text-yellow-800" :
            "bg-gray-100 text-gray-800"
          )}>
            {value}
          </span>
        );
      }

      if (columnId === "reachability") {
        const colors: Record<string, string> = {
          valid: "bg-green-100 text-green-800",
          risky: "bg-yellow-100 text-yellow-800",
          invalid: "bg-red-100 text-red-800",
          unknown: "bg-gray-100 text-gray-800",
        };
        return (
          <span className={cn("px-2 py-1 rounded text-xs", colors[value as string] || colors.unknown)}>
            {value || "unknown"}
          </span>
        );
      }

      if (columnId === "created_at" || columnId === "last_activity") {
        return value ? new Date(value).toLocaleDateString() : "-";
      }

      return value || "-";
    },
    [editingCell, editValue, handleCellBlur]
  );

  const allSelected = leads.length > 0 && selectedIds.length === leads.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < leads.length;

  return (
    <div className={cn("w-full overflow-auto", className)}>
      <table ref={tableRef} className="w-full border-collapse">
        <thead className={cn("bg-muted/50", stickyHeader && "sticky top-0 z-10")}>
          <tr>
            <th className="p-2 text-left border-b w-12">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={handleSelectAll}
              />
            </th>
            {visibleColumns.map((column) => (
              <th
                key={column.id}
                className={cn(
                  "p-2 text-left border-b relative",
                  stickyFirstColumn && column.order === 0 && "sticky left-0 bg-muted/50 z-10"
                )}
                style={{ width: columnWidths[column.id] || 150 }}
              >
                <div className="flex items-center gap-1">
                  <span>{column.label}</span>
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50"
                    onMouseDown={(e) => handleResizeStart(column.id, e)}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className="hover:bg-muted/50 border-b"
            >
              <td className={cn("p-2", stickyFirstColumn && "sticky left-0 bg-background z-10")}>
                <Checkbox
                  checked={selectedIds.includes(lead.id)}
                  onCheckedChange={(checked) => handleSelectRow(lead.id, checked as boolean)}
                />
              </td>
              {visibleColumns.map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    "p-2",
                    stickyFirstColumn && column.order === 0 && "sticky left-12 bg-background z-10"
                  )}
                  style={{ width: columnWidths[column.id] || 150 }}
                  onDoubleClick={() => {
                    const value = (lead as any)[column.id];
                    if (["first_name", "last_name", "email", "company", "title", "phone", "linkedin"].includes(column.id)) {
                      handleCellDoubleClick(lead.id, column.id, value);
                    }
                  }}
                >
                  {renderCellContent(lead, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No leads found
        </div>
      )}
    </div>
  );
}









