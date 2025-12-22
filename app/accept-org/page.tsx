'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function AcceptOrgContent() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<'loading'|'ok'|'error'>('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        setMsg('Missing token')
        return
      }
      const r = await fetch('/api/orgs/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      if (r.ok) {
        const j = await r.json()
        setState('ok')
        setTimeout(() => {
          window.location.href = `/orgs/${j.orgId}/settings`
        }, 1200)
      } else {
        setState('error')
        const text = await r.text()
        setMsg(text || 'Invalid or expired invite')
      }
    })()
  }, [searchParams])

  if (state === 'loading') return <div className="p-8">Accepting invite…</div>
  if (state === 'ok') return <div className="p-8">Invite accepted! Redirecting…</div>
  return <div className="p-8 text-red-600">Error: {msg}</div>
}

export default function AcceptOrgPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AcceptOrgContent />
    </Suspense>
  )
}

