"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Phone, Calendar, X, MessageSquare, Mic } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";
import Link from "next/link";

/**
 * Screen 1 — Unified Lead Inbox (The Money Screen)
 * HOT leads at top, Warm next, Other replies last
 */
type Lead = {
  id: string;
  contact_id: string;
  subject: string | null;
  body: string;
  created_at: string;
  intent_label: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    city: string | null;
    lead_status: string | null;
    est_job_value: number | null;
  } | null;
  campaign: {
    id: string;
    name: string | null;
  } | null;
};

export default function MobileInboxPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showThreadList, setShowThreadList] = useState(true);

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Get workspace
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Fetch inbox items (replies)
      const { data: inboxItems, error } = await supabase
        .from("inbox_messages")
        .select(`
          id,
          subject,
          body,
          created_at,
          intent_label,
          contact_id,
          contacts:contact_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            city,
            lead_status,
            est_job_value
          ),
          campaigns:campaign_id (
            id,
            name
          )
        `)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error loading leads:", error);
        return;
      }

      // Sort: HOT first, then WARM, then others
      const sorted = (inboxItems || []).sort((a, b) => {
        const aStatus = a.contacts?.lead_status || a.intent_label || "";
        const bStatus = b.contacts?.lead_status || b.intent_label || "";
        
        if (aStatus === "hot" || aStatus === "hot_lead") return -1;
        if (bStatus === "hot" || bStatus === "hot_lead") return 1;
        if (aStatus === "warm" || aStatus === "warm_lead") return -1;
        if (bStatus === "warm" || bStatus === "warm_lead") return 1;
        return 0;
      });

      setLeads(sorted as Lead[]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAISuggestions(leadId: string) {
    try {
      const res = await fetch(`/api/mobile/inbox/${leadId}/ai-suggestions`);
      const data = await res.json();
      if (data.suggestions) {
        setAiSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error("Error loading AI suggestions:", error);
    }
  }

  function getStatusBadge(status: string | null) {
    if (status === "hot" || status === "hot_lead") {
      return <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">HOT</span>;
    }
    if (status === "warm" || status === "warm_lead") {
      return <span className="bg-orange-400 text-white text-xs px-2 py-1 rounded-full">WARM</span>;
    }
    return null;
  }

  function handleQuickReply(suggestion: string) {
    if (!selectedLead) return;
    // Navigate to reply screen with pre-filled message
    router.push(`/mobile/inbox/${selectedLead.id}/reply?message=${encodeURIComponent(suggestion)}`);
  }

  function handleCall() {
    if (!selectedLead?.contact?.phone) return;
    window.location.href = `tel:${selectedLead.contact.phone}`;
  }

  function handleBookAppointment() {
    if (!selectedLead) return;
    router.push(`/mobile/book?contact_id=${selectedLead.contact_id}`);
  }

  function handleMarkNotInterested() {
    if (!selectedLead) return;
    // API call to mark as not interested
    fetch(`/api/mobile/inbox/${selectedLead.id}/mark-not-interested`, {
      method: "POST",
    }).then(() => {
      loadLeads();
      setSelectedLead(null);
      setShowThreadList(true);
    });
  }

  // Mobile: Single panel view
  if (showThreadList) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/mobile")}
              className="p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Lead Inbox</h1>
              <p className="text-xs text-gray-600">HOT leads at top</p>
            </div>
          </div>
        </div>

        {/* Lead List */}
        <div className="pb-4">
          {loading && (
            <div className="p-4 text-center text-gray-500">Loading leads...</div>
          )}
          {!loading && leads.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No leads yet. Check back soon!
            </div>
          )}
          {leads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => {
                setSelectedLead(lead);
                setShowThreadList(false);
                loadAISuggestions(lead.id);
              }}
              className="w-full bg-white border-b p-4 text-left hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {lead.contact?.first_name || lead.contact?.last_name
                        ? `${lead.contact.first_name || ""} ${lead.contact.last_name || ""}`.trim()
                        : lead.contact?.email}
                    </span>
                    {getStatusBadge(lead.contact?.lead_status || lead.intent_label)}
                  </div>
                  <div className="text-sm text-gray-600 truncate mb-1">
                    {lead.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-gray-500 line-clamp-2">
                    {lead.body.replace(/\s+/g, " ").slice(0, 100)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {lead.contact?.city && `${lead.contact.city} · `}
                    Est: ${Number(lead.contact?.est_job_value || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Conversation View
  if (selectedLead) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedLead(null);
                setShowThreadList(true);
              }}
              className="p-2 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">
                {selectedLead.contact?.first_name || selectedLead.contact?.last_name
                  ? `${selectedLead.contact.first_name || ""} ${selectedLead.contact.last_name || ""}`.trim()
                  : selectedLead.contact?.email}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {selectedLead.contact?.email}
              </div>
            </div>
            {getStatusBadge(selectedLead.contact?.lead_status || selectedLead.intent_label)}
          </div>
        </div>

        {/* Message Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-lg p-4 mb-4">
            <div className="text-xs text-gray-500 mb-2">
              From: {selectedLead.contact?.email}
              {selectedLead.campaign?.name && ` · Campaign: ${selectedLead.campaign.name}`}
            </div>
            <div className="font-semibold mb-2">
              {selectedLead.subject || "(no subject)"}
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {selectedLead.body}
            </div>
          </div>

          {/* AI Response Suggestions */}
          {aiSuggestions.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">AI Suggestions:</div>
              <div className="space-y-2">
                {aiSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickReply(suggestion)}
                    className="w-full bg-blue-50 border border-blue-200 rounded-lg p-3 text-left text-sm hover:bg-blue-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice Notes Button */}
          <div className="mb-4">
            <button
              onClick={() => router.push(`/mobile/inbox/${selectedLead.id}/notes`)}
              className="w-full bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm font-semibold text-purple-700 flex items-center justify-center gap-2"
            >
              <Mic className="h-4 w-4" />
              Add Voice Note
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white border-t p-4 space-y-2">
          <button
            onClick={handleQuickReply}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-5 w-5" />
            Quick Reply
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCall}
              disabled={!selectedLead.contact?.phone}
              className="bg-green-500 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-300"
            >
              <Phone className="h-4 w-4" />
              Call
            </button>
            <button
              onClick={handleBookAppointment}
              className="bg-purple-500 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <Calendar className="h-4 w-4" />
              Book
            </button>
          </div>
          <button
            onClick={handleMarkNotInterested}
            className="w-full text-gray-600 py-2 rounded-lg flex items-center justify-center gap-2"
          >
            <X className="h-4 w-4" />
            Mark as Not Interested
          </button>
        </div>
      </div>
    );
  }

  return null;
}

