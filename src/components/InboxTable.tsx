"use client";

import React, { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { PipelineStageBadge } from "@/components/ui/PipelineStageBadge";

interface Lead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  has_replied: boolean;
  replied_at: string | null;
  pipeline_stage?: string | null;
}

export default function InboxTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = React.useMemo(() => getSupabaseBrowser(), []);

  useEffect(() => {
    async function fetchLeads() {
      const { data, error } = await supabase
        .from("campaign_leads")
        .select(`
          id,
          has_replied,
          replied_at,
          lead:lead_id (
            id,
            email,
            first_name,
            last_name,
            company,
            pipeline_stage
          )
        `)
        .order("replied_at", { ascending: false, nullsLast: true });

      if (error) {
        console.error("Error fetching leads:", error);
      } else {
        // Flatten the nested lead data
        const flattened = (data || []).map((item: any) => ({
          id: item.id,
          email: item.lead?.email || "",
          first_name: item.lead?.first_name || null,
          last_name: item.lead?.last_name || null,
          company: item.lead?.company || null,
          has_replied: item.has_replied,
          replied_at: item.replied_at,
          pipeline_stage: item.lead?.pipeline_stage || null,
        }));
        setLeads(flattened);
      }
      setLoading(false);
    }

    fetchLeads();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("inbox-leads-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaign_leads" },
        (payload) => {
          setLeads((prev) =>
            prev.map((lead) =>
              lead.id === payload.new.id ? { ...lead, ...payload.new } : lead
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="rounded-2xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">Lead</th>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">Company</th>
            <th className="px-4 py-3 text-left">Pipeline Stage</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Replied At</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-t hover:bg-gray-50">
              <td className="px-4 py-3">
                {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
              </td>
              <td className="px-4 py-3">{lead.email}</td>
              <td className="px-4 py-3">{lead.company || "—"}</td>
              <td className="px-4 py-3">
                <PipelineStageBadge stage={lead.pipeline_stage} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    lead.has_replied
                      ? "text-green-500 font-semibold"
                      : "text-gray-400"
                  }
                >
                  {lead.has_replied ? "Replied ✅" : "No Reply"}
                </span>
              </td>
              <td className="px-4 py-3">
                {lead.replied_at
                  ? new Date(lead.replied_at).toLocaleString()
                  : "—"}
              </td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                No leads yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

