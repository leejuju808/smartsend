"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MessageSquareReply, Send, ExternalLink, Loader2 } from "lucide-react"

type Item = {
  lead_id: string
  thread_id: string | null
  ts: string
  kind: "outbound" | "inbound"
  subject: string | null
  snippet: string | null
  from_email: string | null
  source_id: string
}
type Payload = { 
  lead: { 
    id: string; 
    first_name: string | null; 
    last_name: string | null; 
    email: string; 
    status: string 
  }, 
  items: Item[], 
  gmailUrl: string | null 
}

export default function LeadThreadClient({ leadId }: { leadId: string }) {
  const [data, setData] = React.useState<Payload | null>(null)
  const [loading, setLoading] = React.useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/thread`, { cache: "no-store" })
      const json = await res.json()
      if (res.ok) setData(json)
    } catch (error) {
      console.error("Failed to load thread:", error)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [leadId])

  async function toggleReplied() {
    const res = await fetch(`/api/leads/${leadId}/toggle-replied`, { method: "POST" })
    if (res.ok) load()
  }

  if (loading) {
    return (
      <Card className="border border-zinc-800">
        <CardHeader><CardTitle>Lead Thread</CardTitle></CardHeader>
        <CardContent className="py-12 text-center text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </CardContent>
      </Card>
    )
  }

  if (!data) return null
  const { lead, items, gmailUrl } = data
  const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email

  return (
    <div className="space-y-4">
      <Card className="border border-zinc-800">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">{fullName}</CardTitle>
            <div className="text-sm text-zinc-400">{lead.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={lead.status === "Replied" ? "secondary" : "outline"}>
              {lead.status}
            </Badge>
            {gmailUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={gmailUrl} target="_blank" rel="noreferrer">
                  Open in Gmail <ExternalLink className="h-4 w-4 ml-1" />
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={toggleReplied}>
              {lead.status === "Replied" ? "Unmark Replied" : "Mark Replied"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-sm text-zinc-400">No messages yet.</div>
          ) : (
            <div className="relative pl-6">
              {/* vertical line */}
              <div className="absolute left-2 top-0 bottom-0 w-px bg-zinc-800" />
              <div className="space-y-4">
                {items.map((it) => (
                  <div key={it.source_id} className="relative">
                    {/* dot */}
                    <div className="absolute -left-[7px] top-2 h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="rounded-2xl border border-zinc-800 p-3 hover:bg-zinc-900/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {it.kind === "outbound" ? <Send className="h-4 w-4" /> : <MessageSquareReply className="h-4 w-4" />}
                          <div className="text-sm font-medium">
                            {it.kind === "outbound" ? "You → Lead" : (it.from_email || "Lead → You")}
                          </div>
                        </div>
                        <div className="text-xs text-zinc-400">
                          {new Date(it.ts).toLocaleString()}
                        </div>
                      </div>
                      {it.subject && (
                        <>
                          <div className="mt-1 text-sm">{it.subject}</div>
                          <Separator className="my-2 bg-zinc-800" />
                        </>
                      )}
                      <div className="text-sm text-zinc-400 line-clamp-3">
                        {it.snippet || "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
