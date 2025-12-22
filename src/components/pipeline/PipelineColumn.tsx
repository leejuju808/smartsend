"use client";

import { Droppable, Draggable } from "@hello-pangea/dnd";
import { LeadCard, type Lead } from "./LeadCard";

interface PipelineColumnProps {
  status: string;
  title: string;
  leads: Lead[];
}

export function PipelineColumn({ status, title, leads }: PipelineColumnProps) {
  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`bg-white/5 rounded-xl p-3 shadow border min-h-[200px] transition-colors ${
            snapshot.isDraggingOver ? 'bg-white/10 border-white/20' : 'border-white/10'
          }`}
        >
          {/* Column Header */}
          <div className="mb-3 pb-2 border-b border-white/10">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <div className="text-sm text-gray-400 mt-1">
              {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
            </div>
          </div>

          {/* Leads List */}
          <div className="space-y-3">
            {leads.map((lead, index) => (
              <Draggable key={lead.id} draggableId={lead.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={snapshot.isDragging ? 'opacity-50' : ''}
                  >
                    <LeadCard lead={lead} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>

          {/* Empty State */}
          {leads.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">
              No leads
            </div>
          )}
        </div>
      )}
    </Droppable>
  );
}

