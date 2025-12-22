// Block 24260 — SmartSend Roofing Lead Card Component
// Displays lead information in the pipeline board

"use client";

import { RoofingLead } from "./RoofingPipelineBoard";
import clsx from "clsx";

type RoofingLeadCardProps = {
  lead: RoofingLead;
  onClick: () => void;
};

export function RoofingLeadCard({ lead, onClick }: RoofingLeadCardProps) {
  const statusColors = {
    HOT: "bg-red-500/20 border-red-500/50 text-red-400",
    WARM: "bg-yellow-500/20 border-yellow-500/50 text-yellow-400",
    COLD: "bg-gray-500/20 border-gray-500/50 text-gray-400",
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 cursor-pointer hover:bg-zinc-900/60 transition-colors"
    >
      <div className="flex flex-col gap-2">
        {/* Header: Name and Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-white truncate">
              {lead.homeowner_name}
            </p>
            {lead.address && (
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {lead.address}
              </p>
            )}
          </div>
          <span
            className={clsx(
              "px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 border",
              statusColors[lead.lead_status]
            )}
          >
            {lead.lead_status}
          </span>
        </div>

        {/* Value and Probability */}
        {lead.estimated_value > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-medium">
              {formatCurrency(lead.estimated_value)}
            </span>
            {lead.close_probability > 0 && (
              <span className="text-zinc-500">
                {lead.close_probability}% prob
              </span>
            )}
          </div>
        )}

        {/* Job Type and Payment Type */}
        {(lead.job_type || lead.payment_type) && (
          <div className="flex items-center gap-2 flex-wrap">
            {lead.job_type && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {lead.job_type}
              </span>
            )}
            {lead.payment_type && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
                {lead.payment_type}
              </span>
            )}
          </div>
        )}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {lead.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400"
              >
                {tag}
              </span>
            ))}
            {lead.tags.length > 3 && (
              <span className="text-xs text-zinc-500">+{lead.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer: Days in stage and last contact */}
        <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-800">
          <span>{lead.days_in_stage}d in stage</span>
          {lead.days_since_last_contact !== null && (
            <span>{lead.days_since_last_contact}d ago</span>
          )}
        </div>
      </div>
    </div>
  );
}






































