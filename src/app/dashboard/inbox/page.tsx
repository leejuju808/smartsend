"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function InboxListPage() {
  const [threads, setThreads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const active = localStorage.getItem('active_workspace')
    if (!active) { setError('No workspace selected'); setLoading(false); return }
    fetch(`/api/inbox/threads?workspaceId=${active}`)
      .then(r => r.json())
      .then(j => { setThreads(j.threads || []); setLoading(false) })
      .catch(e => { setError(e?.message || 'Failed'); setLoading(false) })
  }, [])

  if (loading) return <div>Loading…</div>
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b font-medium">Inbox</div>
      <ul className="divide-y">
        {threads.map((t) => (
          <li key={t.id} className="px-4 py-3 hover:bg-gray-50">
            <Link href={`/dashboard/inbox/${t.id}`} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{t.subject || '(no subject)'}</div>
                <div className="text-sm text-gray-600">{t.status} • {new Date(t.last_message_at).toLocaleString()}</div>
              </div>
              <div className="text-xs text-gray-500">Assigned: {t.assigned_to ? 'Yes' : 'Unassigned'}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

