"use client";

import { useState } from "react";
import { Mail, MapPin, Tag, TrendingUp, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SearchResult {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  lead_score?: number | null;
  pipeline_stage?: string | null;
  lead_status?: string | null;
  neighborhood?: string | null;
  storm_risk_level?: string | null;
  insurance_interest?: boolean | null;
  has_tasks?: boolean | null;
  has_overdue_tasks?: boolean | null;
  task_count?: number | null;
  list_ids?: string[] | null;
  has_opened?: boolean | null;
  has_bounced?: boolean | null;
  has_unsubscribed?: boolean | null;
  has_complained?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SearchResultsListProps {
  results: SearchResult[];
  loading?: boolean;
  onContactClick?: (contactId: string) => void;
  total?: number;
}

export function SearchResultsList({
  results,
  loading = false,
  onContactClick,
  total,
}: SearchResultsListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleClick = (contactId: string) => {
    setSelectedId(contactId);
    onContactClick?.(contactId);
  };

  const getStatusColor = (status?: string | null) => {
    switch (status?.toUpperCase()) {
      case "HOT":
        return "bg-red-100 text-red-800 border-red-200";
      case "WARM":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "FOLLOW-UP":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "COLD":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "NOT INTERESTED":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getScoreColor = (score?: number | null) => {
    if (!score) return "text-gray-500";
    if (score >= 70) return "text-red-600 font-semibold";
    if (score >= 30) return "text-orange-600";
    return "text-blue-600";
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No contacts found</p>
        {total !== undefined && total > 0 && (
          <p className="text-sm text-gray-400 mt-2">
            Try adjusting your filters to see more results
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {total !== undefined && (
        <div className="text-sm text-gray-600 mb-4">
          Showing {results.length} of {total} contacts
        </div>
      )}

      <div className="grid gap-4">
        {results.map((contact) => {
          const displayName =
            contact.first_name || contact.last_name
              ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
              : contact.email;

          return (
            <div
              key={contact.id}
              onClick={() => handleClick(contact.id)}
              className={`
                border rounded-lg p-4 cursor-pointer transition-all
                hover:shadow-md hover:border-gray-300
                ${selectedId === contact.id ? "ring-2 ring-primary border-primary" : ""}
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Name and Email */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
                    {contact.lead_score !== null && contact.lead_score !== undefined && (
                      <span className={`text-sm ${getScoreColor(contact.lead_score)}`}>
                        {contact.lead_score}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    {contact.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}
                    {contact.city && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{contact.city}</span>
                        {contact.state && <span>, {contact.state}</span>}
                      </div>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {contact.pipeline_stage && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded border ${getStatusColor(
                          contact.pipeline_stage
                        )}`}
                      >
                        {contact.pipeline_stage}
                      </span>
                    )}
                    {contact.lead_status && contact.lead_status !== contact.pipeline_stage && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded border ${getStatusColor(
                          contact.lead_status
                        )}`}
                      >
                        {contact.lead_status}
                      </span>
                    )}
                    {contact.storm_risk_level && (
                      <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-800 border border-purple-200">
                        {contact.storm_risk_level}
                      </span>
                    )}
                    {contact.insurance_interest && (
                      <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800 border border-green-200">
                        Insurance
                      </span>
                    )}
                  </div>

                  {/* Tags */}
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mb-2">
                      {contact.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                      {contact.tags.length > 5 && (
                        <span className="text-xs text-gray-500">
                          +{contact.tags.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Task Indicators */}
                  {contact.has_tasks && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                      {contact.has_overdue_tasks ? (
                        <>
                          <AlertCircle className="h-3 w-3 text-red-500" />
                          <span className="text-red-600 font-medium">
                            {contact.task_count || 0} overdue task{contact.task_count !== 1 ? "s" : ""}
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          <span>{contact.task_count || 0} task{contact.task_count !== 1 ? "s" : ""}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Email Activity Indicators */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                    {contact.has_opened && (
                      <span className="text-green-600">✓ Opened</span>
                    )}
                    {contact.has_bounced && (
                      <span className="text-red-600">⚠ Bounced</span>
                    )}
                    {contact.has_unsubscribed && (
                      <span className="text-orange-600">✗ Unsubscribed</span>
                    )}
                    {contact.has_complained && (
                      <span className="text-red-600">⚠ Complaint</span>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClick(contact.id);
                  }}
                  className="ml-2"
                >
                  View
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}





















































