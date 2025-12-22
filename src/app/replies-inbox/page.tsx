'use client'

import { useEffect, useState } from 'react'
import { Search, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { InboxTable } from '@/components/replies-inbox/InboxTable'
import { InboxDrawer } from '@/components/replies-inbox/InboxDrawer'

type Lead = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  campaign_id: string
  reply_state?: 'none' | 'suspected' | 'confirmed' | null
  replied_at?: string | null
  last_incoming_at?: string | null
  auto_detected?: boolean
  paused_reason?: string | null
  paused_until?: string | null
  paused?: boolean
}

export default function RepliesInboxPage() {
  const [rows, setRows] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [onlyReplied, setOnlyReplied] = useState(false)
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lead, setLead] = useState<Lead | null>(null)

  const pageSize = 25

  useEffect(() => {
    loadLeads()
  }, [page, onlyReplied])

  async function loadLeads() {
    setLoading(true)
    try {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRows([])
        setLoading(false)
        return
      }

      // Build query for campaign leads with reply states
      let query = supabase
        .from('campaign_leads')
        .select(`
          campaign_id,
          paused_reason,
          paused_until,
          reply_state,
          replied_at,
          last_incoming_at,
          auto_detected,
          leads!inner(
            id,
            email,
            first_name,
            last_name,
            company
          )
        `)
        .order('replied_at', { ascending: false })
        .order('last_incoming_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      // Filter for replied only if enabled
      if (onlyReplied) {
        query = query.in('reply_state', ['confirmed', 'suspected'])
      }

      const { data, error } = await query

      if (!error && data) {
        // Transform the data to flatten the nested leads
        const transformed = data.map((item: any) => {
          const pausedReason = item.paused_reason ?? null
          const pausedUntil = item.paused_until ?? null
          const isPaused = Boolean(pausedUntil) || pausedReason === 'ooo_detected'

          return {
            id: item.leads.id,
            email: item.leads.email,
            first_name: item.leads.first_name,
            last_name: item.leads.last_name,
            company: item.leads.company,
            campaign_id: item.campaign_id,
            reply_state: item.reply_state || 'none',
            replied_at: item.replied_at,
            last_incoming_at: item.last_incoming_at,
            auto_detected: item.auto_detected || false,
            paused_reason: pausedReason,
            paused_until: pausedUntil,
            paused: isPaused,
          } as Lead
        })
        
        setRows(transformed)
      }
    } catch (err) {
      console.error('Failed to load leads:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter rows by search query
  const filteredRows = rows.filter((r) => {
    if (!q.trim()) return true
    const searchLower = q.toLowerCase()
    return (
      r.email.toLowerCase().includes(searchLower) ||
      r.first_name?.toLowerCase().includes(searchLower) ||
      r.last_name?.toLowerCase().includes(searchLower) ||
      r.company?.toLowerCase().includes(searchLower)
    )
  })

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('replies-inbox-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_leads',
        },
        (payload) => {
          console.log('Realtime update:', payload)
          loadLeads()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [page, onlyReplied])

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Replies Inbox</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email…"
              className="w-64 rounded-xl border px-9 py-2 text-sm outline-none ring-0 focus:border-gray-400"
            />
          </div>
          <button
            onClick={() => setOnlyReplied((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
              onlyReplied 
                ? 'bg-gray-900 text-white border-gray-900' 
                : 'bg-white hover:bg-gray-50'
            }`}
            title="Show only replied"
          >
            <Filter className="h-4 w-4" /> {onlyReplied ? 'Only replied' : 'All leads'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border p-10 text-center text-gray-500">Loading…</div>
      ) : (
        <InboxTable
          data={filteredRows}
          onRowClick={(lead) => {
            setLead(lead)
            setDrawerOpen(true)
          }}
          onResume={loadLeads}
        />
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </button>
        <span className="text-sm text-gray-500">Page {page}</span>
        <button
          className="rounded-xl border px-3 py-2 text-sm"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      <InboxDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} lead={lead} />
    </main>
  )
}

