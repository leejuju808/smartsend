"use client";

import { Contact, ContactStats, ContactOwner } from "@/lib/types/contact";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Copy, Phone, Mail } from "lucide-react";
import { useState } from "react";

interface ContactHeaderProps {
  contact: Contact;
  stats: ContactStats;
  owner: ContactOwner | null;
  onStatusChange: (status: string) => void;
}

const statusColors: Record<string, string> = {
  New: "bg-gray-500",
  Attempting: "bg-blue-500",
  Warm: "bg-yellow-500",
  Hot: "bg-red-500",
  Customer: "bg-green-500",
  "Not Interested": "bg-gray-400",
};

const intentColors: Record<string, string> = {
  HOT_LEAD: "bg-red-500",
  WARM_LEAD: "bg-yellow-500",
  FOLLOW_UP: "bg-blue-500",
  NOT_INTERESTED: "bg-gray-400",
};

export function ContactHeader({
  contact,
  stats,
  owner,
  onStatusChange,
}: ContactHeaderProps) {
  const [copied, setCopied] = useState(false);

  const displayName =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email;

  const copyEmail = () => {
    navigator.clipboard.writeText(contact.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never";
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
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Name and Primary Info */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <button
              onClick={copyEmail}
              className="flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              {contact.email}
              {copied && <span className="text-green-500">✓ Copied</span>}
            </button>
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Phone className="h-4 w-4" />
                {contact.phone}
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Select value={contact.status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select status" />
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Attempting">Attempting</SelectItem>
              <SelectItem value="Warm">Warm</SelectItem>
              <SelectItem value="Hot">Hot</SelectItem>
              <SelectItem value="Customer">Customer</SelectItem>
              <SelectItem value="Not Interested">Not Interested</SelectItem>
            </SelectTrigger>
          </Select>
        </div>
      </div>

      {/* Status and Intent Badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge
          variant={contact.status === "Hot" ? "destructive" : "default"}
          className={statusColors[contact.status] || "bg-gray-500"}
        >
          {contact.status}
        </Badge>

        {stats.last_intent && (
          <Badge
            variant="outline"
            className={intentColors[stats.last_intent] || "bg-gray-500"}
          >
            Last intent: {stats.last_intent}
          </Badge>
        )}

        {/* Quick Stats */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Last activity: {formatRelativeTime(stats.last_activity_at)}
          </span>
          <span className="text-muted-foreground">
            Emails: {stats.emails_sent} / {stats.emails_replied} replied
          </span>
          {contact.estimated_job_value && (
            <span className="text-muted-foreground">
              Est. value: ${contact.estimated_job_value.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

