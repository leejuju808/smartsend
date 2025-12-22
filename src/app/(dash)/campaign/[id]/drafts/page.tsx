"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Draft = {
  id: string;
  created_at: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  subject: string;
  status: "draft" | "queued" | "sent" | "deleted";
  queued_at?: string | null;
  sent_at?: string | null;
  source?: string | null;
  meta?: any;
};

export default function DraftsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const sp = useSearchParams();
  const page = Number(sp.get("page") ?? "1");
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<Draft[]>([]);
  const [count, setCount] = React.useState(0);
  const [leads, setLeads] = React.useState<Record<string, any>>({});

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaign/${params.id}/drafts?page=${page}`);
      const j = await r.json();
      setRows(j.items ?? []);
      setCount(j.count ?? 0);
      setLeads(j.leads ?? {});
    } catch {
      /* noop */
    }
    setLoading(false);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function approve(id: string) {
    const r = await fetch(`/api/draft/${id}/approve`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      toast.success("Draft queued");
      load();
    } else {
      toast.error(j?.error ?? "Approve failed");
    }
  }

  async function sendNow(id: string) {
    const r = await fetch(`/api/draft/${id}/send`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      toast.success("Send requested");
      load();
    } else {
      toast.error(j?.error ?? "Send failed");
    }
  }

  async function remove(id: string) {
    const r = await fetch(`/api/draft/${id}/delete`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      toast.success("Draft deleted");
      load();
    } else {
      toast.error(j?.error ?? "Delete failed");
    }
  }

  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Drafts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No drafts right now.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Lead</th>
                    <th className="px-3 py-2 text-left">Subject</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const L = leads[d.lead_id];
                    const leadName = L ? `${L.first_name ?? ""} ${L.last_name ?? ""}`.trim() : "";
                    const leadLine = L ? leadName || L.email || L.company || d.lead_id : d.lead_id;
                    return (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2">{leadLine}</td>
                        <td className="px-3 py-2">{d.subject}</td>
                        <td className="px-3 py-2">
                          {d.status === "queued" ? "Queued" : d.status === "draft" ? "Draft" : d.status}
                        </td>
                        <td className="px-3 py-2 text-right space-x-2">
                          {d.status === "draft" && (
                            <>
                              <Button size="sm" onClick={() => approve(d.id)}>
                                Approve &amp; Queue
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => sendNow(d.id)}
                              >
                                Send Now
                              </Button>
                            </>
                          )}
                          {d.status !== "deleted" && (
                            <Button size="sm" variant="outline" onClick={() => remove(d.id)}>
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`?page=${Math.max(1, page - 1)}`)}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`?page=${Math.min(pages, page + 1)}`)}
                disabled={page >= pages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

