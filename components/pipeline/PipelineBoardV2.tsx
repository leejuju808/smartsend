// components/pipeline/PipelineBoard.tsx
"use client";

import { usePipelineBoard } from "@/lib/hooks/usePipelineBoard";
import { useState } from "react";

type PipelineBoardProps = {
  pipelineId: string;
};

export function PipelineBoardV2({ pipelineId }: PipelineBoardProps) {
  const { stages, items, loading, error, refresh } = usePipelineBoard(pipelineId);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  if (loading) return <div className="p-4">Loading pipeline…</div>;
  if (error) return <div className="p-4 text-red-500">Error loading pipeline</div>;

  // Group items by stage
  const itemsByStage: Record<string, typeof items> = {};
  stages.forEach((s) => (itemsByStage[s.id] = []));
  items.forEach((i) => {
    if (!itemsByStage[i.stage_id]) itemsByStage[i.stage_id] = [];
    itemsByStage[i.stage_id].push(i);
  });

  const handleDragStart = (itemId: string) => {
    setDraggedItem(itemId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (toStageId: string) => {
    if (!draggedItem) return;

    const item = items.find((i) => i.id === draggedItem);
    if (!item || item.stage_id === toStageId) {
      setDraggedItem(null);
      return;
    }

    try {
      const response = await fetch("/api/pipelines/move-contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactPipelineId: draggedItem,
          toStageId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to move contact");
      }

      // Refresh the board
      refresh();
    } catch (err) {
      console.error("Failed to move contact:", err);
    } finally {
      setDraggedItem(null);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => (
        <div
          key={stage.id}
          className="min-w-[240px] bg-slate-50 rounded-2xl p-3 border"
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(stage.id)}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">{stage.name}</h3>
            <span className="text-xs text-gray-500">
              {itemsByStage[stage.id]?.length || 0}
            </span>
          </div>

          <div className="space-y-2">
            {itemsByStage[stage.id]?.map((row) => {
              const contact = row.contact;
              const displayName =
                contact?.name ||
                [contact?.first_name, contact?.last_name]
                  .filter(Boolean)
                  .join(" ") ||
                "No name";

              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => handleDragStart(row.id)}
                  className="bg-white rounded-xl p-2 border text-xs cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <div className="font-semibold text-gray-800">{displayName}</div>
                  {contact?.company && (
                    <div className="text-gray-500">{contact.company}</div>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                      {contact?.lead_status || "new"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}



























































