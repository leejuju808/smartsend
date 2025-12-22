'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

export default function CampaignOwnershipPage() {
  const params = useParams()
  const campaignId = params.id as string
  const [ownedBy, setOwnedBy] = useState<'user' | 'org'>('user')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Load campaign ownership
    fetch(`/api/campaigns/${campaignId}`)
      .then(r => r.json())
      .then(data => {
        const campaign = data.campaign || data
        if (campaign.owned_by) setOwnedBy(campaign.owned_by)
        if (campaign.org_id || campaign.owner_org_id) setOrgId(campaign.org_id || campaign.owner_org_id)
      })
      .catch(console.error)

    // Load user's orgs
    fetch('/api/orgs/list')
      .then(r => r.json())
      .then(data => {
        if (data.orgs) setOrgs(data.orgs)
      })
      .catch(console.error)
  }, [campaignId])

  const handleSave = async () => {
    setLoading(true)
    const targetOrgId = ownedBy === 'org' ? orgId : null
    const r = await fetch(`/api/campaigns/${campaignId}/ownership`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetOrgId })
    })
    if (r.ok) {
      alert('Ownership updated successfully')
    } else {
      alert('Failed to update ownership')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold">Campaign Ownership</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Transfer ownership between personal and workspace
        </p>
      </div>

      <div className="rounded border p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Ownership</label>
          <Select value={ownedBy} onValueChange={(v: 'user' | 'org') => setOwnedBy(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Personal</SelectItem>
              <SelectItem value="org">Workspace</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {ownedBy === 'org' && (
          <div>
            <label className="block text-sm font-medium mb-2">Workspace</label>
            <Select 
              value={orgId || ''} 
              onValueChange={(v) => setOrgId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map(org => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {ownedBy === 'org' && orgId && (
          <div className="rounded bg-yellow-50 border border-yellow-200 p-3 text-sm">
            This campaign will be owned by the workspace. Admins can manage access.
          </div>
        )}

        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

