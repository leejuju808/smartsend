"use client";

import { Droppable } from "@hello-pangea/dnd";
import { LeadCard } from "./lead-card";

export function StageColumn({
  stage,
  mutate,
}: {
  stage: any;
  mutate: () => void;
}) {
  return (
    <Droppable droppableId={stage.id}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`w-72 bg-muted p-4 rounded-lg min-h-[400px] ${
            snapshot.isDraggingOver ? "bg-muted/80" : ""
          }`}
        >
          <div className="mb-3">
            <h2 className="font-bold text-base">{stage.name}</h2>
            <p className="text-xs opacity-60 mt-1">
              {stage.leads?.length || 0} leads
            </p>
          </div>
          <div className="space-y-3">
            {stage.leads?.map((lead: any, index: number) => (
              <LeadCard key={lead.id} lead={lead} index={index} />
            ))}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}

