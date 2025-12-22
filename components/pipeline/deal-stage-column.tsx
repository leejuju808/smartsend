"use client";

import { Droppable } from "@hello-pangea/dnd";
import { DealCard } from "./deal-card";

export function DealStageColumn({
  stage,
  deals,
  mutate,
}: {
  stage: { id: string; name: string; color: string };
  deals: any[];
  mutate: () => void;
}) {
  return (
    <Droppable droppableId={stage.id}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`w-72 bg-muted p-4 rounded-lg min-h-[400px] flex flex-col ${
            snapshot.isDraggingOver ? "bg-muted/80 ring-2 ring-primary" : ""
          }`}
        >
          <div className="mb-3">
            <h2 className="font-bold text-base">{stage.name}</h2>
            <p className="text-xs opacity-60 mt-1">
              {deals.length} {deals.length === 1 ? "deal" : "deals"}
            </p>
          </div>
          <div className="space-y-3 flex-1">
            {deals.map((deal, index) => (
              <DealCard key={deal.id} deal={deal} index={index} />
            ))}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}









