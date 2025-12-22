"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface AILead {
  id: string;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  score: number | null;
  status: string;
  source: string | null;
  created_at: string;
}

export default function ProspectorPanel() {
  const [leads, setLeads] = useState<AILead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/leads/ai?limit=10&order=score.desc");
      if (response.ok) {
        const data = await response.json();
        setLeads(data || []);
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-2">
      <h2 className="text-lg font-semibold">AI Prospector ⚡</h2>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading leads...</div>
      ) : leads.length === 0 ? (
        <div className="text-sm text-muted-foreground">No leads yet. Run the prospector to find leads.</div>
      ) : (
        leads.map((lead) => (
          <div key={lead.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
            <div className="flex-1">
              <div className="font-medium">{lead.company || "Unknown Company"}</div>
              {lead.contact_name && (
                <div className="text-xs text-muted-foreground">{lead.contact_name}</div>
              )}
            </div>
            {lead.score !== null && (
              <span className="text-muted-foreground font-mono text-xs ml-4">
                {Math.round(lead.score)}
              </span>
            )}
          </div>
        ))
      )}
    </Card>
  );
}

