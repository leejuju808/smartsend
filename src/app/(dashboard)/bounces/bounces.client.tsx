"use client"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { AlertCircle, Mail } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

type BounceRow = {
  id: string
  created_at: string
  bounce_type: "hard" | "soft" | "unknown"
  reason: string
  raw_snippet: string
  provider: "gmail" | "outlook"
  leads: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    status: string
  }
}

export default function BouncesClient({ initialBounces }: { initialBounces: any[] }) {
  const [bounces, setBounces] = React.useState<BounceRow[]>(initialBounces)
  const [filter, setFilter] = React.useState<"all" | "hard" | "soft">("all")

  const filtered = bounces.filter(b => filter === "all" || b.bounce_type === filter)
  
  const hardCount = bounces.filter(b => b.bounce_type === "hard").length
  const softCount = bounces.filter(b => b.bounce_type === "soft").length

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Bounces</h1>
        <p className="text-zinc-400">Track email bounce events and lead status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/10 rounded-full">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <div className="text-sm text-zinc-400">Total Bounces</div>
                <div className="text-2xl font-bold">{bounces.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-600/10 rounded-full">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-400">Hard Bounces</div>
                <div className="text-2xl font-bold">{hardCount}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-600/10 rounded-full">
                <AlertCircle className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-400">Soft Bounces</div>
                <div className="text-2xl font-bold">{softCount}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "all" 
              ? "bg-zinc-800 text-white" 
              : "bg-zinc-900/50 text-zinc-400 hover:text-white"
          }`}
        >
          All Bounces
        </button>
        <button
          onClick={() => setFilter("hard")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "hard" 
              ? "bg-zinc-800 text-white" 
              : "bg-zinc-900/50 text-zinc-400 hover:text-white"
          }`}
        >
          Hard Only
        </button>
        <button
          onClick={() => setFilter("soft")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "soft" 
              ? "bg-zinc-800 text-white" 
              : "bg-zinc-900/50 text-zinc-400 hover:text-white"
          }`}
        >
          Soft Only
        </button>
      </div>

      {/* Table */}
      <Card className="border border-zinc-800">
        <CardHeader>
          <CardTitle>Bounce Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <Table>
              <THead>
                <TR className="bg-zinc-900/50">
                  <TH>Lead</TH>
                  <TH>Type</TH>
                  <TH>Reason</TH>
                  <TH>Provider</TH>
                  <TH>Preview</TH>
                  <TH>Time</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center py-8 text-zinc-400">
                      No bounces found.
                    </TD>
                  </TR>
                ) : (
                  filtered.map((bounce) => (
                    <TR key={bounce.id} className="hover:bg-zinc-900/40">
                      <TD>
                        <div className="font-medium">
                          {bounce.leads.first_name} {bounce.leads.last_name}
                        </div>
                        <div className="text-xs text-zinc-400">{bounce.leads.email}</div>
                      </TD>
                      <TD>
                        {bounce.bounce_type === "hard" ? (
                          <Badge className="bg-red-600/20 text-red-300">Hard</Badge>
                        ) : bounce.bounce_type === "soft" ? (
                          <Badge className="bg-orange-600/20 text-orange-300">Soft</Badge>
                        ) : (
                          <Badge className="bg-gray-600/20 text-gray-300">Unknown</Badge>
                        )}
                      </TD>
                      <TD className="max-w-[200px] truncate">{bounce.reason}</TD>
                      <TD>
                        <Badge variant="outline">{bounce.provider}</Badge>
                      </TD>
                      <TD className="max-w-[300px] text-zinc-400 truncate">
                        {bounce.raw_snippet || "-"}
                      </TD>
                      <TD>
                        <div className="text-sm">{formatDistanceToNow(new Date(bounce.created_at), { addSuffix: true })}</div>
                        <div className="text-xs text-zinc-400">
                          {new Date(bounce.created_at).toLocaleString()}
                        </div>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
