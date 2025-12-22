'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

export default function OrgSettings({ params }: { params: { id: string } }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin'|'member'|'viewer'>('member')
  const [invites, setInvites] = useState<any[]>([])

  const load = async () => {
    const r = await fetch(`/api/orgs/${params.id}/invites`)
    if (r.ok) {
      const data = await r.json()
      setInvites(data.invites || [])
    }
  }

  useEffect(() => {
    load()
  }, [params.id])

  const invite = async () => {
    if (!email) return
    const r = await fetch(`/api/orgs/${params.id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role })
    })
    if (r.ok) {
      setEmail('')
      await load()
    }
  }

  const deleteInvite = async (inviteId: string) => {
    const r = await fetch(`/api/orgs/${params.id}/invites`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId })
    })
    if (r.ok) {
      await load()
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Invite to workspace</div>
        <div className="flex gap-2">
          <Input 
            placeholder="teammate@company.com" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={role} onValueChange={(v: any) => setRole(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite}>Send invite</Button>
        </div>

        <div className="space-y-2 mt-4">
          <div className="text-sm text-muted-foreground">Pending invites</div>
          {invites.map(iv => (
            <div key={iv.id} className="flex items-center justify-between border rounded p-2">
              <div className="flex-1">
                <div className="text-sm font-medium">{iv.email}</div>
                <div className="text-xs text-muted-foreground">{iv.role}</div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => deleteInvite(iv.id)}
              >
                Remove
              </Button>
            </div>
          ))}
          {invites.length === 0 && (
            <div className="text-xs text-muted-foreground">No pending invites.</div>
          )}
        </div>
      </div>
    </div>
  )
}

