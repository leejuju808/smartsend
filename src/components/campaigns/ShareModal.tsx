'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/Input'
import { Loader2, Share2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast/ToastProvider'
import { Badge } from '@/components/ui/badge'

type ShareRow = { id: string; user_id: string; email?: string; role: 'viewer'|'editor' }
type PendingInvite = { email: string; role: 'viewer'|'editor'; expires_at: string; created_at: string }

export default function ShareModal({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer'|'editor'>('viewer')
  const [loading, setLoading] = useState(false)
  const [shares, setShares] = useState<ShareRow[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [removing, setRemoving] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const { push } = useToast()

  // Fetch current user ID
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/me')
      if (r.ok) {
        const j = await r.json()
        setMe(j?.id ?? null)
      }
    })()
  }, [])

  async function loadShares() {
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/shares`, { method: 'GET' })
      if (r.ok) {
        const j = await r.json()
        setShares(j.members || [])
      }
    } catch (error: any) {
      console.error('Error loading shares:', error)
    }
  }

  async function loadPendingInvites() {
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/invites`, { method: 'GET' })
      if (r.ok) {
        const j = await r.json()
        setPendingInvites(j.invites || [])
      }
    } catch (error: any) {
      console.error('Error loading pending invites:', error)
    }
  }

  useEffect(() => { 
    if (open) {
      loadShares()
      loadPendingInvites()
    }
  }, [open, campaignId])

  async function removeShare(shareId: string, userId: string) {
    setRemoving(shareId)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/shares`, {
        method: 'DELETE', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_id: shareId, user_id: userId })
      })
      setRemoving(null)
      if (r.ok) { 
        push({ 
          title: 'Success', 
          description: 'Collaborator removed', 
          type: 'success' 
        })
        loadShares() 
      } else { 
        const data = await r.json()
        push({ 
          title: 'Error', 
          description: data.error || 'Failed to remove collaborator', 
          type: 'error' 
        })
      }
    } catch (error: any) {
      setRemoving(null)
      push({ 
        title: 'Error', 
        description: error.message || 'Failed to remove collaborator', 
        type: 'error' 
      })
    }
  }

  async function addShare() {
    if (!email) return
    
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      })

      const data = await res.json()

      if (res.ok) {
        if (data.share) {
          // User exists and was added directly
          push({ 
            title: 'Success', 
            description: `Campaign shared with ${email}`, 
            type: 'success' 
          })
        } else {
          // Invite sent
          push({ 
            title: 'Invite sent!', 
            description: `${email} will receive an email with a sign-in link to join the campaign.`, 
            type: 'success' 
          })
        }
        setEmail('')
        loadShares()
        loadPendingInvites()
      } else {
        // Handle seat limit error specifically
        if (data.error === 'seat_limit_reached' || data.error?.includes('seat_limit')) {
          push({ 
            title: 'Seat limit reached', 
            description: `Seat limit reached (used ${data.seats_used || '?'} of ${data.seat_limit || '?'}). Upgrade to add more collaborators.`, 
            type: 'error' 
          })
        } else {
          push({ 
            title: 'Error', 
            description: data.error || 'Failed to share campaign', 
            type: 'error' 
          })
        }
      }
    } catch (error: any) {
      push({ 
        title: 'Error', 
        description: error.message || 'Failed to share campaign', 
        type: 'error' 
      })
    } finally {
      setLoading(false)
    }
  }

  async function setMemberRole(shareId: string, newRole: 'viewer'|'editor') {
    setLoading(true)
    try {
      // Find the share to get user_id
      const share = shares.find(s => s.id === shareId)
      if (!share) return
      
      const r = await fetch(`/api/campaigns/${campaignId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: share.user_id, role: newRole })
      })
      
      if (r.ok) {
        loadShares()
      } else {
        const data = await r.json()
        push({
          title: 'Error',
          description: data.error || 'Failed to update role',
          type: 'error'
        })
      }
    } catch (error: any) {
      push({
        title: 'Error',
        description: error.message || 'Failed to update role',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={()=>setOpen(true)}>
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>
    )
  }

  return (
    <Card className="fixed inset-x-4 top-24 max-w-lg mx-auto z-50 rounded-2xl shadow-lg">
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-medium">Share Campaign</div>
        <div className="flex gap-2">
          <Input 
            placeholder="teammate@email.com" 
            value={email} 
            onChange={e=>setEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={role} onValueChange={(v:any)=>setRole(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={addShare} disabled={loading || !email}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Viewers can see campaign, queue, logs, replies. Editors can modify leads/variants and schedule; only owners can delete or change sending accounts.
        </div>
        <div className="pt-2">
          <div className="text-sm font-medium mb-2">Who has access</div>
          <div className="space-y-2 max-h-56 overflow-auto">
            {shares.map(s => {
              const isMe = s.user_id === me
              return (
                <div key={s.id} className="flex items-center justify-between rounded border p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-muted" />
                    <span className="text-sm">{s.email || s.user_id.slice(0,8) + '…'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.role === 'editor' ? 'default' : 'secondary'}>{s.role}</Badge>
                    
                    {!isMe && (
                      <Select 
                        value={s.role} 
                        onValueChange={(v) => setMemberRole(s.id, v as 'viewer'|'editor')}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    
                    {isMe ? (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => removeShare(s.id, s.user_id)}
                        disabled={!!removing}
                      >
                        Leave
                      </Button>
                    ) : (
                      <Button
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeShare(s.id, s.user_id)}
                        disabled={!!removing || removing === s.id}
                      >
                        🗑️
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
            {shares.length === 0 && pendingInvites.length === 0 && (
              <div className="text-xs text-muted-foreground">No collaborators yet.</div>
            )}
          </div>
        </div>
        {pendingInvites.length > 0 && (
          <div className="pt-2">
            <div className="text-sm font-medium mb-2">Pending invites</div>
            <div className="space-y-2 max-h-40 overflow-auto">
              {pendingInvites.map((inv, idx) => (
                <div key={idx} className="flex items-center justify-between rounded border p-2 bg-yellow-50">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-muted" />
                    <span className="text-sm">{inv.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{inv.role}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={()=>setOpen(false)}>Close</Button>
        </div>
      </CardContent>
    </Card>
  )
}

