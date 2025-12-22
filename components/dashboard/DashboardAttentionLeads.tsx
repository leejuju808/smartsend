"use client";

import Link from "next/link";
import { Zap, MessageSquare, Shield, Cloud, Calendar } from "lucide-react";

interface AttentionLead {
  id: string;
  name: string | null;
  email: string;
  type: "hot" | "warm_question" | "insurance" | "storm" | "availability";
  lastActivityAt: string;
  leadScore: number;
}

interface AttentionLeadsProps {
  leads: AttentionLead[];
}

export function AttentionLeads({ leads }: AttentionLeadsProps) {
  const getTypeInfo = (type: string) => {
    switch (type) {
      case "hot":
        return {
          icon: <Zap className="h-4 w-4" />,
          label: "🔥 HOT",
          color: "text-orange-600 bg-orange-50 border-orange-200",
        };
      case "warm_question":
        return {
          icon: <MessageSquare className="h-4 w-4" />,
          label: "🟡 Warm (Questions)",
          color: "text-yellow-600 bg-yellow-50 border-yellow-200",
        };
      case "insurance":
        return {
          icon: <Shield className="h-4 w-4" />,
          label: "💼 Insurance",
          color: "text-blue-600 bg-blue-50 border-blue-200",
        };
      case "storm":
        return {
          icon: <Cloud className="h-4 w-4" />,
          label: "🌩️ Storm Damage",
          color: "text-purple-600 bg-purple-50 border-purple-200",
        };
      case "availability":
        return {
          icon: <Calendar className="h-4 w-4" />,
          label: "📅 Asking for Availability",
          color: "text-green-600 bg-green-50 border-green-200",
        };
      default:
        return {
          icon: <MessageSquare className="h-4 w-4" />,
          label: "Lead",
          color: "text-gray-600 bg-gray-50 border-gray-200",
        };
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="rounded-lg border-2 border-gray-200 p-6 bg-white">
      <h3 className="text-lg font-semibold mb-4">Leads Requiring Attention</h3>
      <div className="space-y-3">
        {leads.length === 0 ? (
          <p className="text-sm text-gray-500">No leads requiring attention</p>
        ) : (
          leads.map((lead) => {
            const typeInfo = getTypeInfo(lead.type);
            return (
              <Link
                key={lead.id}
                href={`/contacts/${lead.id}`}
                className="block p-4 rounded-lg border-2 hover:shadow-md transition-all bg-white"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${typeInfo.color}`}
                      >
                        {typeInfo.icon}
                        {typeInfo.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        Score: {lead.leadScore}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">
                      {lead.name || "Unknown"}
                    </p>
                    <p className="text-sm text-gray-600">{lead.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTimeAgo(lead.lastActivityAt)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
      {leads.length > 0 && (
        <Link
          href="/pipeline"
          className="block mt-4 text-sm text-blue-600 hover:underline text-center"
        >
          View all leads →
        </Link>
      )}
    </div>
  );
}





















































