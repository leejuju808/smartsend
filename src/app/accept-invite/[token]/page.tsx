"use client"
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function AcceptInvitePage() {
  const params = useParams() as { token?: string }
  const router = useRouter()
  const [status, setStatus] = useState<'idle'|'accepting'|'accepted'|'error'>('idle')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const run = async () => {
      const token = params?.token
      if (!token) return
      setStatus('accepting')
      setError('')
      try {
        const res = await fetch('/api/invite/team/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to accept invite')
        setStatus('accepted')
        // Redirect to dashboard with team selected
        const teamId = json?.teamId
        if (teamId) localStorage.setItem('active_team', teamId)
        router.replace('/dashboard')
      } catch (e: any) {
        setError(e?.message || 'Something went wrong')
        setStatus('error')
      }
    }
    run()
  }, [params, router])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow text-center">
        <h1 className="text-2xl font-bold mb-4">Accepting Invite…</h1>
        {status === 'accepting' && <p className="text-gray-500">Please wait…</p>}
        {status === 'accepted' && <p className="text-green-600">Invite accepted. Redirecting…</p>}
        {status === 'error' && <p className="text-red-600">{error}</p>}
      </div>
    </main>
  )
}

