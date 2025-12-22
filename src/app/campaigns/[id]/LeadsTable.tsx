"use client"

import * as React from "react"
import { getSupabaseBrowser } from "@/lib/supabaseClient"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

type Lead = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company?: string | null
  status: "new" | "queued" | "sent" | "replied" | "bounced" | "paused"
  bounced?: boolean
  replied_at: string | null
  reply_detected?: boolean
  reply_summary?: string | null
  reply_classification?: string | null
  reply_excerpt?: string | null
  reply_status?: string | null
  reply_intent?: string | null
  reply_label?: string | null
  outreach_status?: string | null
  last_reply_at?: string | null
  last_reply_snippet?: string | null
  last_sent_at?: string | null
}

type CampaignLead = {
  lead_id: string
  is_active: boolean
  stopped_at: string | null
}

type Enrollment = {
  lead_id: string
  status: 'active' | 'paused_replied' | 'paused_bounced' | 'unsubscribed'
  paused_reason: string | null
}

export default function LeadsTable({ campaignId }: { campaignId: string }) {
  const supabase = React.useMemo(getSupabaseBrowser, [])
  const [leads, setLeads] = React.useState<Lead[]>([])
  const [campaignLeads, setCampaignLeads] = React.useState<Map<string, CampaignLead>>(new Map())
  const [enrollments, setEnrollments] = React.useState<Map<string, Enrollment>>(new Map())
  const [q, setQ] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  const fetchLeads = React.useCallback(async () => {
    setLoading(true)
    
    // Fetch leads
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("id,email,first_name,last_name,company,status,bounced,replied_at,reply_detected,reply_summary,reply_classification,reply_status,reply_intent,reply_label,outreach_status,last_reply_at,last_reply_snippet,last_sent_at")
      .eq("campaign_id", campaignId)
      .order("replied_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
    
    if (leadsError) {
      console.error("Error fetching leads:", leadsError)
    } else if (leadsData) {
      setLeads(leadsData as Lead[])
    }

    // Fetch campaign_leads to check is_active status and replied_at
    const { data: clData, error: clError } = await supabase
      .from("campaign_leads")
      .select("lead_id, is_active, stopped_at, replied_at, last_reply_snippet")
      .eq("campaign_id", campaignId)
    
    if (clError) {
      console.error("Error fetching campaign_leads:", clError)
    } else if (clData) {
      const clMap = new Map<string, CampaignLead>()
      clData.forEach((cl) => {
        clMap.set(cl.lead_id, cl as CampaignLead)
      })
      setCampaignLeads(clMap)
    }

    // Fetch sequence enrollments to check pause status
    const { data: enrollData, error: enrollError } = await supabase
      .from("sequence_enrollments")
      .select("lead_id, status, paused_reason")
      .eq("campaign_id", campaignId)
    
    if (enrollError) {
      console.error("Error fetching enrollments:", enrollError)
    } else if (enrollData) {
      const enrollMap = new Map<string, Enrollment>()
      enrollData.forEach((e) => {
        enrollMap.set(e.lead_id, e as Enrollment)
      })
      setEnrollments(enrollMap)
    }
    
    setLoading(false)
  }, [campaignId, supabase])

  React.useEffect(() => {
    fetchLeads()
    const channel = supabase
      .channel(`replies-campaign-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          setLeads((prev) =>
            prev.map((l) => (l.id === payload.new.id ? { ...(l as Lead), ...(payload.new as Lead) } : l))
          )
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaign_leads", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const cl = payload.new as CampaignLead & { lead_id: string }
          setCampaignLeads((prev) => {
            const updated = new Map(prev)
            updated.set(cl.lead_id, cl)
            return updated
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId, supabase, fetchLeads])

  const filtered = React.useMemo(() => {
    if (!q.trim()) return leads
    const s = q.toLowerCase()
    return leads.filter(
      (l) =>
        l.email.toLowerCase().includes(s) ||
        (l.first_name ?? "").toLowerCase().includes(s) ||
        (l.last_name ?? "").toLowerCase().includes(s)
    )
  }, [leads, q])

  return (
    <Card className="border border-neutral-800 bg-black/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl">Leads</CardTitle>
        <div className="w-64">
          <Input
            placeholder="Search leads…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-neutral-900 border-neutral-800"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-2 text-sm">
            <HeaderCell className="col-span-3">Company</HeaderCell>
            <HeaderCell className="col-span-3">Email</HeaderCell>
            <HeaderCell className="col-span-2">Last Sent</HeaderCell>
            <HeaderCell className="col-span-2">Reply Status</HeaderCell>
            <HeaderCell className="col-span-2">Actions</HeaderCell>

            {filtered.map((l) => (
              <React.Fragment key={l.id}>
                <Cell className="col-span-3">
                  <div className="font-medium">{l.company || "—"}</div>
                  <div className="text-neutral-400 text-xs">
                    {[l.first_name, l.last_name].filter(Boolean).join(" ") || ""}
                  </div>
                </Cell>

                <Cell className="col-span-3">
                  <div className="font-medium">{l.email}</div>
                  <div className="text-neutral-400 text-xs truncate">
                    {l.last_reply_snippet ? `Last reply: ${l.last_reply_snippet}` : ""}
                  </div>
                </Cell>

                <Cell className="col-span-2">
                  {l.last_sent_at ? (
                    <time dateTime={l.last_sent_at} className="text-xs text-neutral-300">
                      {new Date(l.last_sent_at).toLocaleString()}
                    </time>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </Cell>

                <Cell className="col-span-2">
                  {(() => {
                    const label = (l.reply_label || l.outreach_status || "").toLowerCase()
                    if (label === "hot") return <Badge className="bg-red-500/20 text-red-300 border border-red-400/30 w-fit">Hot</Badge>
                    if (label === "warm") return <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-400/30 w-fit">Warm</Badge>
                    if (label === "dead") return <Badge className="bg-neutral-600/20 text-neutral-300 border border-neutral-500/30 w-fit">Dead</Badge>
                    return <span className="text-neutral-500 text-xs">None</span>
                  })()}
                </Cell>

                <Cell className="col-span-2">
                  <div className="flex flex-col gap-2">
                    {(() => {
                      const enrollment = enrollments.get(l.id)
                      if (enrollment && enrollment.status !== 'active') {
                        return <ResumeButton campaignId={campaignId} leadId={l.id} />
                      }
                      return <MarkAsRepliedButton id={l.id} disabled={l.status === "replied"} />
                    })()}
                  </div>
                </Cell>
              </React.Fragment>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HeaderCell({
  className = "",
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`px-2 py-2 text-neutral-400 ${className}`}>{children}</div>
}
function Cell({
  className = "",
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`px-2 py-3 border-t border-neutral-800 ${className}`}>{children}</div>
}

function MarkAsRepliedButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const supabase = React.useMemo(getSupabaseBrowser, [])
  const [busy, setBusy] = React.useState(false)

  const onClick = async () => {
    setBusy(true)
    await supabase.from("leads").update({
      status: "replied",
      replied_at: new Date().toISOString(),
    }).eq("id", id)
    setBusy(false)
  }

  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="text-xs rounded-xl px-3 py-1 border border-neutral-700 hover:border-neutral-500 disabled:opacity-50"
    >
      {busy ? "Saving…" : "Mark as Replied"}
    </button>
  )
}

function ResumeButton({ campaignId, leadId }: { campaignId: string; leadId: string }) {
  const [busy, setBusy] = React.useState(false)

  const onClick = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/enrollments/${leadId}/resume`, {
        method: 'POST',
      })
      if (!res.ok) {
        throw new Error('Failed to resume enrollment')
      }
      // Reload page to refresh enrollment status
      window.location.reload()
    } catch (error) {
      console.error('Failed to resume:', error)
      alert('Failed to resume enrollment. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-xs rounded-xl px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-400/30 hover:bg-blue-600/30 disabled:opacity-50"
    >
      {busy ? "Resuming…" : "Resume"}
    </button>
  )
}