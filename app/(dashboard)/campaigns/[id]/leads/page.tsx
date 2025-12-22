"use client";
import { useEffect, useMemo, useState } from "react";
import ImportLeadsModal from "@/components/leads/ImportLeadsModal";
import { VerifyNow } from "@/components/leads/VerifyNow";
import { Button } from "@/components/ui/button";
import { CampaignLeadsTable, CampaignLeadRow } from "./_components/campaign-leads-table";
import Link from "next/link";

type Lead = {
  id: string;
  lead_id?: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  status: string;
  created_at: string;
  last_replied_at?: string | null;
  reply_intent_label?: string | null;
  reply_intent_confidence?: number | null;
  last_reply_intent?: string | null;
  last_reply_sentiment?: "positive" | "neutral" | "negative" | null;
  replied_at?: string | null;
  verify_status?: "valid" | "risky" | "invalid" | "unknown" | null;
  verify_reasons?: string[] | null;
};

export default function LeadsPage({ params }: { params: { id: string } }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = async () => {
    setLoading(true);
    // Fetch a larger page size for client-side filtering
    const res = await fetch(`/api/campaigns/${params.id}/leads?page=1&page_size=1000`);
    const json = await res.json();
    setRows(json.rows ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, [params.id]);

  // Transform API data to CampaignLeadRow format
  const transformedRows: CampaignLeadRow[] = useMemo(() => {
    return rows.map((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || null;
      
      // Map status from API to CampaignLeadStatus
      // The API returns statuses like 'new', 'queued', 'sent', 'replied', 'unsub', 'bounced', 'paused'
      // Map them to our CampaignLeadStatus type
      let status: CampaignLeadRow["status"] = "active";
      if (r.status === "replied") {
        status = "replied";
      } else if (r.status === "unsub" || r.status === "unsubscribed") {
        status = "unsubscribed";
      } else if (r.status === "bounced") {
        status = "bounced";
      } else if (r.status === "completed") {
        status = "completed";
      } else if (r.status === "error" || r.status === "failed") {
        status = "error";
      }

      return {
        id: r.id,
        lead_id: r.lead_id || r.id,
        email: r.email,
        name,
        status,
        last_reply_intent: (r.last_reply_intent as CampaignLeadRow["last_reply_intent"]) || null,
        last_reply_sentiment: r.last_reply_sentiment || null,
        replied_at: r.replied_at || r.last_replied_at || null,
        last_sent_at: null, // TODO: Add this field to the API if needed
      };
    });
  }, [rows]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filter by status and AI-classified reply intent.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VerifyNow 
            campaignId={params.id} 
            leads={rows.map(r => ({ id: r.id, email: r.email }))}
            onVerified={fetchRows}
          />
          <Link href="/leads/import">
            <Button variant="outline">Import Leads</Button>
          </Link>
          <Button onClick={() => setOpen(true)}>Import CSV</Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading leads...
        </div>
      ) : (
        <CampaignLeadsTable rows={transformedRows} campaignId={params.id} />
      )}

      <ImportLeadsModal workspaceId="default" campaignId={params.id} />
    </>
  );
}


