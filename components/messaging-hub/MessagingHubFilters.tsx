"use client";

import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Users,
  TrendingUp,
  Shield,
  Truck,
  UsersRound,
  AlertCircle,
  Clock,
  Flame,
  Calendar,
  CheckCircle,
} from "lucide-react";

type Filter =
  | "all"
  | "homeowners"
  | "leads"
  | "insurance"
  | "suppliers"
  | "crews"
  | "high_priority"
  | "needs_follow_up"
  | "hot_leads"
  | "scheduled_jobs"
  | "completed_jobs";

type MessagingHubFiltersProps = {
  filter: Filter;
  channel: string | null;
  onFilterChange: (filter: Filter) => void;
  onChannelChange: (channel: string | null) => void;
};

const filters: {
  id: Filter;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "all", label: "All Messages", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "homeowners", label: "Homeowners", icon: <Users className="w-4 h-4" /> },
  { id: "leads", label: "Leads", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "insurance", label: "Insurance", icon: <Shield className="w-4 h-4" /> },
  { id: "suppliers", label: "Suppliers", icon: <Truck className="w-4 h-4" /> },
  { id: "crews", label: "Crews", icon: <UsersRound className="w-4 h-4" /> },
  {
    id: "high_priority",
    label: "High Priority",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  {
    id: "needs_follow_up",
    label: "Needs Follow-Up",
    icon: <Clock className="w-4 h-4" />,
  },
  { id: "hot_leads", label: "Hot Leads", icon: <Flame className="w-4 h-4" /> },
  {
    id: "scheduled_jobs",
    label: "Scheduled Jobs",
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    id: "completed_jobs",
    label: "Completed Jobs",
    icon: <CheckCircle className="w-4 h-4" />,
  },
];

const channels = [
  { id: null, label: "All Channels" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "webform", label: "Website Forms" },
  { id: "campaign_reply", label: "Campaign Replies" },
  { id: "internal_note", label: "Internal Notes" },
];

export function MessagingHubFilters({
  filter,
  channel,
  onFilterChange,
  onChannelChange,
}: MessagingHubFiltersProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm text-gray-900">Filters</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                filter === f.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              {f.icon}
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Channels
        </h3>
        <div className="space-y-1">
          {channels.map((c) => (
            <button
              key={c.id || "all"}
              onClick={() => onChannelChange(c.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                channel === c.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}






































