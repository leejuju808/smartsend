"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Square } from "lucide-react";
import { useState } from "react";
import { AddNoteModal } from "./add-note-modal";

interface Lead {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  city?: string | null;
  intent_label?: string | null;
  tags?: string[] | null;
}

interface LeadTimelineHeaderProps {
  lead: Lead;
  onNoteAdded?: () => void;
  onStopFollowUp?: () => void;
}

/**
 * Block 11200 — SmartSend Lead Timeline v1
 * Header component showing homeowner name, intent badge, city, tags, and action buttons
 */
export function LeadTimelineHeader({
  lead,
  onNoteAdded,
  onStopFollowUp,
}: LeadTimelineHeaderProps) {
  const [showNoteModal, setShowNoteModal] = useState(false);

  const leadName =
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email ||
    "Unknown Homeowner";

  const getIntentBadge = () => {
    const intent = lead.intent_label?.toUpperCase();
    if (!intent) return null;

    const intentMap: Record<string, { label: string; className: string }> = {
      HOT: {
        label: "🔥 HOT",
        className: "bg-red-500/15 text-red-600 border-red-500/30",
      },
      WARM: {
        label: "🌤️ WARM",
        className: "bg-orange-500/15 text-orange-600 border-orange-500/30",
      },
      NOT_INTERESTED: {
        label: "🚫 NOT INTERESTED",
        className: "bg-gray-500/15 text-gray-600 border-gray-500/30",
      },
      FOLLOW_UP: {
        label: "🔁 FOLLOW UP",
        className: "bg-blue-500/15 text-blue-600 border-blue-500/30",
      },
    };

    const config = intentMap[intent] || {
      label: intent,
      className: "bg-slate-500/15 text-slate-600 border-slate-500/30",
    };

    return (
      <Badge variant="outline" className={`text-xs font-semibold ${config.className}`}>
        {config.label}
      </Badge>
    );
  };

  const handleNoteAdded = () => {
    setShowNoteModal(false);
    onNoteAdded?.();
  };

  return (
    <div className="border-b pb-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Homeowner Name */}
          <h1 className="text-2xl font-bold mb-2">{leadName}</h1>

          {/* Email */}
          <p className="text-sm text-muted-foreground mb-3">{lead.email}</p>

          {/* Intent Badge, City, Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            {getIntentBadge()}
            {lead.city && (
              <span className="text-sm text-muted-foreground">{lead.city}</span>
            )}
            {lead.tags && lead.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {lead.tags.slice(0, 3).map((tag, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-xs bg-slate-100 text-slate-700 border-slate-300"
                  >
                    {tag}
                  </Badge>
                ))}
                {lead.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{lead.tags.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNoteModal(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Note
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onStopFollowUp}
            className="gap-2"
          >
            <Square className="h-4 w-4" />
            Stop Follow-Up
          </Button>
        </div>
      </div>

      {/* Add Note Modal */}
      {showNoteModal && (
        <AddNoteModal
          leadId={lead.id}
          onClose={() => setShowNoteModal(false)}
          onSaved={handleNoteAdded}
        />
      )}
    </div>
  );
}























































