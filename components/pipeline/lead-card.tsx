"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { getScoreV3Color } from "@/lib/leads/scoring-v3";
import { ReasonBadge } from "@/components/leads/ReasonBadge";

function colorForScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "bg-gray-100 text-gray-600";
  if (score >= 80) return "bg-red-100 text-red-700";
  if (score >= 50) return "bg-orange-100 text-orange-700";
  if (score >= 20) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function colorForScoreV3(score: number | null | undefined): string {
  // Use the proper v3 color system: 90+ = Red, 75-89 = Orange, 50-74 = Yellow, 20-49 = Blue, <20 = Gray
  return getScoreV3Color(score);
}

export function LeadCard({
  lead,
  index,
}: {
  lead: any;
  index: number;
}) {
  const leadName =
    lead.name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email ||
    "Untitled Lead";

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`p-3 cursor-pointer ${
            snapshot.isDragging ? "opacity-50 shadow-lg" : ""
          }`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{leadName}</p>
                <p className="text-xs opacity-70">{lead.email}</p>
                {lead.company && (
                  <p className="text-xs opacity-60 mt-1">{lead.company}</p>
                )}
              </div>
              {(lead.score_v3 !== null && lead.score_v3 !== undefined) ? (
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 border ${colorForScoreV3(lead.score_v3)}`}>
                  {lead.score_v3}
                </span>
              ) : (lead.score_v2 !== null && lead.score_v2 !== undefined) ? (
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${colorForScore(lead.score_v2)}`}>
                  {lead.score_v2}
                </span>
              ) : (lead.score !== null && lead.score !== undefined) ? (
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${colorForScore(lead.score)}`}>
                  {lead.score}
                </span>
              ) : null}
            </div>
            {(lead.status === "won" || lead.status === "lost") && (
              <div className="flex items-center gap-2">
                <ReasonBadge
                  reason={lead.status === "won" ? lead.win_reason : lead.loss_reason}
                  status={lead.status}
                  confidence={lead.reason_confidence}
                />
              </div>
            )}
          </div>
        </Card>
      )}
    </Draggable>
  );
}

