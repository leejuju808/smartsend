"use client";

// Block 35333 — Dead Lead Manager Component
// Allows managing and filtering dead leads

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Phone, Mail, MapPin, DollarSign, Calendar } from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface DeadLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  proposal_amount: number | null;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  appointment_booked_at: string | null;
  revival_score: number | null;
  last_activity_at: string;
  days_inactive: number;
  revival_messages_sent: number;
  last_revival_message_at: string | null;
}

interface DeadLeadManagerProps {
  workspaceId: string;
}

const FILTER_OPTIONS = [
  { value: "all", label: "All Dead Leads" },
  { value: "proposal_not_signed", label: "Proposal Not Signed" },
  { value: "appointment_not_booked", label: "Appointment Never Booked" },
  { value: "storm_trigger", label: "Storm-Trigger Leads" },
  { value: "financing_reopen", label: "Financing Reopen" },
  { value: "high_potential", label: "High Potential (Score ≥ 60)" },
];

export function DeadLeadManager({ workspaceId }: DeadLeadManagerProps) {
  const [filter, setFilter] = useState("all");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  const { data, error, isLoading, mutate } = useSWR<{
    leads: DeadLead[];
    total: number;
  }>(
    `/api/revival/dead-leads?workspace_id=${workspaceId}&filter=${filter}`,
    fetcher,
    {
      refreshInterval: 60000, // Refresh every minute
    }
  );

  const handleSendRevival = async (leadId: string, level: number = 1) => {
    try {
      const response = await fetch("/api/revival/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          workspaceId,
          sequenceLevel: level,
          channel: "sms",
        }),
      });

      if (response.ok) {
        mutate();
        alert("Revival message sent successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to send message: ${error.error}`);
      }
    } catch (err) {
      alert("Error sending revival message");
    }
  };

  const getRevivalScoreColor = (score: number | null) => {
    if (!score) return "bg-gray-100 text-gray-600";
    if (score >= 60) return "bg-green-100 text-green-700";
    if (score >= 40) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600">Error loading dead leads</p>
        </CardContent>
      </Card>
    );
  }

  const leads = data?.leads || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Dead Lead Manager</CardTitle>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {data?.total || 0} dead leads found
        </p>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No dead leads found with this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">
                        {lead.name || "Unknown Name"}
                      </h3>
                      {lead.revival_score !== null && (
                        <Badge
                          className={getRevivalScoreColor(lead.revival_score)}
                        >
                          Score: {lead.revival_score}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {lead.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {lead.email}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </div>
                      )}
                      {lead.address && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {lead.address}
                          {lead.city && `, ${lead.city}`}
                          {lead.state && `, ${lead.state}`}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {lead.days_inactive} days inactive
                      </div>
                      {lead.proposal_amount && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${lead.proposal_amount.toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {lead.proposal_sent_at && (
                        <span>
                          Proposal sent:{" "}
                          {new Date(lead.proposal_sent_at).toLocaleDateString()}
                        </span>
                      )}
                      {lead.revival_messages_sent > 0 && (
                        <span>
                          • {lead.revival_messages_sent} revival message
                          {lead.revival_messages_sent !== 1 ? "s" : ""} sent
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSendRevival(lead.id, 1)}
                      className="w-full"
                    >
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Send Revival
                    </Button>
                    {lead.revival_score && lead.revival_score >= 60 && (
                      <Badge variant="secondary" className="text-xs">
                        High Priority
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
































