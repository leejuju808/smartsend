"use client"
import * as React from "react"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCcw, Send } from "lucide-react"
import { enqueueEmail } from "@/hooks/useEnqueueEmail"

type Campaign = { id: string; name: string }
type Row = {
  reply_id: string
  replied_at: string
  from_email: string
  subject: string
  snippet: string
  lead_id: string
  lead_email: string
  first_name: string | null
  last_name: string | null
  owner_id: string | null
  lead_status: string
  campaign_id: string | null
  campaign_name: string | null
  status?: string
}

export default function RepliesClient({ campaigns }: { campaigns: Campaign[] }) {
  const [q, setQ] = React.useState("")
  const [status, setStatus] = React.useState<"any" | "Replied" | "Active">("any")
  const [campaignId, setCampaignId] = React.useState<string>("any")
  const [rows, setRows] = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const pageSize = 20

  const fetchData = React.useCallback(async (p = page) => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(p),
      pageSize: String(pageSize),
      status,
      campaignId,
    })
    if (q) params.set("q", q)
    const res = await fetch(`/api/replies?${params.toString()}`, { cache: "no-store" })
    const json = await res.json()
    if (res.ok) {
      setRows(json.data)
      setTotal(json.total)
      setPage(json.page)
    }
    setLoading(false)
  }, [q, status, campaignId, page])

  React.useEffect(() => { fetchData(1) }, [q, status, campaignId])

  // Realtime: listen for new rows in replies and refresh
  React.useEffect(() => {
    const ch = supabase
      .channel("replies-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "replies" }, () => fetchData(1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const pages = Math.max(1, Math.ceil(total / pageSize))

  async function toggleReplied(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}/toggle-replied`, { method: "POST" })
    if (res.ok) fetchData()
  }

  async function handleTestSend() {
    try {
      await enqueueEmail({
        to_email: "test@example.com",
        subject: "SmartSend test",
        text: "This is a SmartSend test from your queue.",
      });
      alert("Enqueued!");
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <Card className="border border-zinc-800">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-xl">Replies</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTestSend}>
            <Send className="h-4 w-4 mr-1" /> Test Send
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <Input
            placeholder="Search email, subject, snippet…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All statuses</SelectItem>
              <SelectItem value="Replied">Replied</SelectItem>
              <SelectItem value="Active">Active (not replied)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger><SelectValue placeholder="Campaign" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All campaigns</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <Table>
            <THead>
              <TR className="bg-zinc-900/50">
                <TH>Lead</TH>
                <TH>From</TH>
                <TH>Subject</TH>
                <TH>Snippet</TH>
                <TH>Campaign</TH>
                <TH>Replied</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {loading ? (
                <TR>
                  <TD colSpan={7} className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                    Loading…
                  </TD>
                </TR>
              ) : rows.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="text-center py-8 text-zinc-400">
                    No replies found.
                  </TD>
                </TR>
              ) : (
                rows.map(r => (
                  <TR key={r.reply_id} className="hover:bg-zinc-900/40">
                    <TD>
                      <div className="font-medium">{r.first_name ?? ""} {r.last_name ?? ""}</div>
                      <div className="text-xs text-zinc-400">{r.lead_email}</div>
                    </TD>
                    <TD>
                      <div className="text-sm">{r.from_email}</div>
                      <div className="text-xs text-zinc-400">{new Date(r.replied_at).toLocaleString()}</div>
                    </TD>
                    <TD className="max-w-[280px] truncate">
                      <div className="flex items-center gap-2">
                        <span>{r.subject ?? 'No subject'}</span>
                        {r.status === 'handled' ? (
                          <span className="text-[10px] rounded-full px-2 py-0.5 bg-muted">Handled</span>
                        ) : (
                          <span className="text-[10px] rounded-full px-2 py-0.5 bg-primary/10">Open</span>
                        )}
                      </div>
                    </TD>
                    <TD className="max-w-[360px] text-zinc-400 truncate">{r.snippet}</TD>
                    <TD>{r.campaign_name ?? "-"}</TD>
                    <TD>
                      {r.lead_status === "Replied" ? (
                        <Badge variant="secondary" className="bg-emerald-600/20 text-emerald-300">Replied</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex gap-2 justify-end">
                        {r.lead_status !== "Replied" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={async () => {
                              const res = await fetch(`/api/leads/${r.lead_id}/pause`, { method: "POST" });
                              if (res.ok) {
                                fetchData();
                              }
                            }}
                          >
                            Pause Sequences
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => toggleReplied(r.lead_id)}>
                          {r.lead_status === "Replied" ? "Unmark" : "Mark Replied"}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4 text-sm">
          <div className="text-zinc-400">Total: {total}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { const n = page - 1; setPage(n); fetchData(n) }}>Prev</Button>
            <div className="px-2 py-1 border rounded-md">{page} / {pages}</div>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => { const n = page + 1; setPage(n); fetchData(n) }}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
