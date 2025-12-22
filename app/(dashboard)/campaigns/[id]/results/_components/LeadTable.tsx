"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface LeadTableProps {
  campaignId: string;
}

interface LeadRow {
  id: string;
  homeowner: string;
  status: string;
  replySnippet: string;
  estimatedValue: number;
  threadId?: string;
}

export function LeadTable({ campaignId }: LeadTableProps) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeads() {
      const supabase = createClient();

      // Get all leads that have replied to this campaign
      // Try multiple sources: inbound_messages, email_replies, email_messages
      const { data: replies } = await supabase
        .from("inbound_messages")
        .select("lead_id, from_email, text_body, campaign_id")
        .eq("campaign_id", campaignId)
        .not("lead_id", "is", null);

      // Also check email_replies table
      const { data: emailReplies } = await supabase
        .from("email_replies")
        .select("lead_id, from_email, body, raw_text, campaign_id")
        .eq("campaign_id", campaignId)
        .not("lead_id", "is", null);

      // Also check email_messages (inbound direction)
      const { data: emailMessages } = await supabase
        .from("email_messages")
        .select("lead_id, from_email, body, campaign_id")
        .eq("campaign_id", campaignId)
        .eq("direction", "in")
        .not("lead_id", "is", null);

      // Combine all lead IDs that have replied
      const repliedLeadIds = new Set<string>();
      const replySnippets: Record<string, string> = {};
      
      [...(replies || []), ...(emailReplies || []), ...(emailMessages || [])].forEach((reply) => {
        if (reply.lead_id) {
          repliedLeadIds.add(reply.lead_id);
          // Store snippet (first 100 chars)
          if (!replySnippets[reply.lead_id]) {
            const snippet = reply.text_body || reply.body || reply.raw_text || "";
            replySnippets[reply.lead_id] = snippet.slice(0, 100) + (snippet.length > 100 ? "..." : "");
          }
        }
      });

      if (repliedLeadIds.size === 0) {
        setLoading(false);
        return;
      }

      const leadIdsArray = Array.from(repliedLeadIds);

      // Get lead details
      const { data: leads } = await supabase
        .from("leads")
        .select("id, email, first_name, last_name, name")
        .in("id", leadIdsArray);

      // Get lead statuses from multiple sources
      const { data: leadStatuses1 } = await supabase
        .from("lead_auto_follow_up_stats")
        .select("lead_id, lead_status")
        .eq("campaign_id", campaignId)
        .in("lead_id", leadIdsArray);

      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, email, lead_status")
        .in("email", leads?.map(l => l.email).filter(Boolean) || []);

      // Get thread IDs for navigation
      const { data: threads } = await supabase
        .from("inbox_threads")
        .select("id, lead_id, campaign_id")
        .eq("campaign_id", campaignId)
        .in("lead_id", leadIdsArray);

      // Build lead rows
      const leadRows: LeadRow[] = leadIdsArray.map((leadId) => {
        const lead = leads?.find((l) => l.id === leadId);
        const statusRow = leadStatuses1?.find((ls) => ls.lead_id === leadId);
        const contact = contacts?.find((c) => c.email === lead?.email);
        const thread = threads?.find((t) => t.lead_id === leadId);

        // Determine status (prioritize lead_auto_follow_up_stats, then contacts)
        let status = "NEW";
        if (statusRow?.lead_status) {
          status = statusRow.lead_status.toUpperCase();
        } else if (contact?.lead_status) {
          status = contact.lead_status.toUpperCase();
        }

        // Map status to display format
        if (status === "HOT") status = "HOT";
        else if (status === "WARM") status = "WARM";
        else if (status === "FOLLOW_UP" || status === "NEUTRAL") status = "FOLLOW_UP";
        else status = "NEW";

        // Get estimated value based on status
        const estimatedValue =
          status === "HOT"
            ? 7000
            : status === "WARM"
            ? 2500
            : status === "FOLLOW_UP"
            ? 1000
            : 300;

        return {
          id: leadId,
          homeowner:
            lead?.name ||
            `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim() ||
            lead?.email ||
            "Unknown",
          status,
          replySnippet: replySnippets[leadId] || "No reply snippet available",
          estimatedValue,
          threadId: thread?.id,
        };
      });

      // Sort by status priority (HOT > WARM > FOLLOW_UP > NEW) then by estimated value
      leadRows.sort((a, b) => {
        const statusOrder = { HOT: 1, WARM: 2, FOLLOW_UP: 3, NEW: 4 };
        const statusDiff =
          (statusOrder[a.status as keyof typeof statusOrder] || 99) -
          (statusOrder[b.status as keyof typeof statusOrder] || 99);
        return statusDiff !== 0
          ? statusDiff
          : b.estimatedValue - a.estimatedValue;
      });

      setLeads(leadRows);
      setLoading(false);
    }

    fetchLeads();
  }, [campaignId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HOT":
        return "bg-red-100 text-red-800 border-red-200";
      case "WARM":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "FOLLOW_UP":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Lead Table</h2>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Loading leads...</p>
        </Card>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Lead Table</h2>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            No leads with replies yet. Leads will appear here as they engage.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Lead Table</h2>
      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 text-sm font-semibold">Homeowner</th>
                <th className="text-left p-2 text-sm font-semibold">Status</th>
                <th className="text-left p-2 text-sm font-semibold">Reply Snippet</th>
                <th className="text-right p-2 text-sm font-semibold">Estimated Value</th>
                <th className="text-center p-2 text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-muted/50">
                  <td className="p-2">
                    <div className="font-medium">{lead.homeowner}</div>
                  </td>
                  <td className="p-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(
                        lead.status
                      )}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="text-sm text-muted-foreground max-w-md truncate">
                      {lead.replySnippet}
                    </div>
                  </td>
                  <td className="p-2 text-right font-semibold">
                    {formatCurrency(lead.estimatedValue)}
                  </td>
                  <td className="p-2 text-center">
                    {lead.threadId ? (
                      <Link href={`/campaigns/${campaignId}/inbox/${lead.threadId}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Thread
                        </Button>
                      </Link>
                    ) : lead.id ? (
                      <Link href={`/campaigns/${campaignId}/inbox?leadId=${lead.id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Thread
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

