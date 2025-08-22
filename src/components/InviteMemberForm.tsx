"use client"
import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { canManageMembers } from '@/utils/permissions'

export default function InviteMemberForm() {
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'admin' | 'member'>('member')
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('active_workspace')
    if (id) setWorkspaceId(id)
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !workspaceId) return
      const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle()
      setMyRole((data as any)?.role ?? null)
    })()
  }, [supabase, workspaceId])

  const canInvite = useMemo(() => canManageMembers(myRole), [myRole])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!workspaceId) {
      setMessage('No active workspace selected.')
      return
    }
    setSubmitting(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const resp = await fetch('/api/workspaces/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ workspaceId, email, role }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Failed')
      setEmail('')
      setRole('member')
      setMessage('Invite sent.')
    } catch (err: any) {
      setMessage(err?.message || 'Failed to invite')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canInvite) return null

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="email"
        placeholder="teammate@company.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm w-64"
      />
      <select
        className="rounded-lg border px-3 py-2 text-sm"
        value={role}
        onChange={(e) => setRole(e.target.value as any)}
      >
        <option value="owner">Owner</option>
        <option value="admin">Admin</option>
        <option value="member">Member</option>
      </select>
      <button disabled={submitting} className="rounded-lg bg-black text-white text-sm px-3 py-2 disabled:opacity-50">
        {submitting ? 'Inviting…' : 'Invite'}
      </button>
      {message && <span className="text-xs text-slate-500 ml-2">{message}</span>}
    </form>
  )
}

