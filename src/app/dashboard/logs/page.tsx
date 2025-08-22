"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

type Row = { action: string; meta: any; created_at: string }

export default function LogsPage() {
  const sb = createClientComponentClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await sb
        .from('audit_log')
        .select('action, meta, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
      setRows((data as any) || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Activity Logs</h1>
      <p className="text-sm text-gray-600 mb-6">Latest 5 actions from your account.</p>
      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2 border-b">When</th>
              <th className="p-2 border-b">Action</th>
              <th className="p-2 border-b">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2 text-gray-700">{typeof r.meta === 'object' ? JSON.stringify(r.meta) : String(r.meta)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-gray-600" colSpan={3}>No recent activity.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

