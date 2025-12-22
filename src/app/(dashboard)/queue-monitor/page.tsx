'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import QueueRealtime from '@/components/queue/QueueRealtime'

type QueueRow = {
  id: string
  to_email: string
  from_email: string
  status: string
  attempt: number
  updated_at: string
  error_message: string | null
  lead_id: string
}

export default function QueueMonitorPage() {
  const searchParams = useSearchParams()
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const [pageSize] = useState(25)
  const [totalCount, setTotalCount] = useState(0)

  const supabase = createClientComponentClient()

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))

  async function loadQueue() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.id)
        .single()

      if (!profile?.workspace_id) {
        setLoading(false)
        return
      }

      const fromIdx = (page - 1) * pageSize
      const toIdx = fromIdx + pageSize - 1

      const { data: fetchedRows, count, error } = await supabase
        .from('send_queue_monitor_view')
        .select('*', { count: 'exact' })
        .eq('workspace_id', profile.workspace_id)
        .order('updated_at', { ascending: false })
        .range(fromIdx, toIdx)

      if (error) {
        console.error('Error loading queue:', error)
        setLoading(false)
        return
      }

      setRows(fetchedRows ?? [])
      setTotalCount(count ?? 0)
    } catch (e) {
      console.error('Error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQueue()
  }, [page])

  function pageHref(p: number): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    return `?${params.toString()}`
  }

  const localRows = rows

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Queue Monitor</h1>
      
      <QueueRealtime onChange={loadQueue} />

      <Card>
        <CardHeader>
          <CardTitle>Send Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-3 text-left">To</th>
                  <th className="p-3 text-left">From</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Attempt</th>
                  <th className="p-3 text-left">Updated</th>
                  <th className="p-3 text-left">Error</th>
                  <th className="p-3 text-right">Lead</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : (
                  <>
                    {localRows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="p-3">{r.to_email}</td>
                        <td className="p-3">{r.from_email}</td>
                        <td className="p-3">{r.status}</td>
                        <td className="p-3">{r.attempt ?? 0}</td>
                        <td className="p-3">{new Date(r.updated_at).toLocaleString()}</td>
                        <td className="p-3 max-w-[260px]">
                          <div className="truncate text-red-600/80">{r.error_message ?? ''}</div>
                        </td>
                        <td className="p-3 text-right">
                          <Link href={`/leads/${r.lead_id}`} className="text-primary hover:underline">
                            Lead
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {localRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No jobs
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        <div className="flex items-center justify-between p-3 border-t text-sm">
          <div>Page {page} of {pageCount}</div>
          <div className="flex gap-2">
            <Button asChild variant="outline" disabled={page <= 1}>
              <Link href={pageHref(page - 1)}>Prev</Link>
            </Button>
            <Button asChild variant="outline" disabled={page >= pageCount}>
              <Link href={pageHref(page + 1)}>Next</Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

