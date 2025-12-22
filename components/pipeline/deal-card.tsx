"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { DealPanel } from "./deal-panel";

export function DealCard({
  deal,
  index,
}: {
  deal: any;
  index: number;
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const lead = deal.leads || {};
  const owner = deal.owner || {};
  
  const displayName = 
    lead.first_name && lead.last_name
      ? `${lead.first_name} ${lead.last_name}`
      : lead.company || lead.email || "Untitled Deal";

  const companyName = lead.company || "";

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <>
      <Draggable draggableId={deal.id} index={index}>
        {(provided, snapshot) => (
          <Card
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`p-3 cursor-pointer hover:shadow-md transition-shadow ${
              snapshot.isDragging ? "opacity-50 shadow-lg" : ""
            }`}
            onClick={() => setIsPanelOpen(true)}
          >
            <div className="space-y-2">
              <div>
                <p className="font-semibold text-sm">{deal.title || displayName}</p>
                {companyName && (
                  <p className="text-xs opacity-70 mt-0.5">{companyName}</p>
                )}
              </div>
              
              {deal.value && (
                <p className="text-sm font-medium text-green-600">
                  {formatCurrency(deal.value)}
                </p>
              )}
              
              <div className="flex items-center justify-between text-xs">
                {owner.email && (
                  <span className="opacity-60">Owner: {owner.email.split("@")[0]}</span>
                )}
                {deal.probability !== null && deal.probability !== undefined && (
                  <span className="opacity-60">{deal.probability}%</span>
                )}
              </div>

              {deal.next_action && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs opacity-70">
                    <span className="font-medium">Next:</span> {deal.next_action}
                  </p>
                  {deal.next_action_due && (
                    <p className="text-xs opacity-60 mt-0.5">
                      Due: {new Date(deal.next_action_due).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </Draggable>

      <DealPanel
        deal={deal}
        open={isPanelOpen}
        onOpenChange={(open) => {
          setIsPanelOpen(open);
          if (!open) {
            // Refresh deals when panel closes
            window.dispatchEvent(new Event("deal-updated"));
          }
        }}
      />
    </>
  );
}

