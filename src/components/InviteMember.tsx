'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface InviteMemberProps {
  teamId: string
  invitedBy: string
}

export default function InviteMember({ teamId, invitedBy }: InviteMemberProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, email, role, invitedBy })
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to send invite')
        return
      }
      
      alert('Invite sent!')
      setEmail('')
      setOpen(false)
    } catch (error) {
      console.error('Error sending invite:', error)
      alert('Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Invite Member</Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input 
            placeholder="email@company.com" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            type="email"
            disabled={loading}
          />
          <select 
            className="w-full border rounded-lg p-2" 
            value={role} 
            onChange={e => setRole(e.target.value as any)}
            disabled={loading}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button onClick={handleInvite} disabled={loading || !email}>
            {loading ? 'Sending...' : 'Send Invite'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

