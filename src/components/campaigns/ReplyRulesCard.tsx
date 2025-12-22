'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'

export function ReplyRulesCard({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/campaigns/${campaignId}/rules`)
        const j = await r.json()
        setRules(j)
      } catch (e) {
        console.error('Failed to load rules:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [campaignId])

  if (loading || !rules) {
    return <div className="rounded border p-4 text-sm text-muted-foreground">Loading rules...</div>
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/rules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules)
      })
      if (!r.ok) throw new Error('Failed to save')
      alert('Rules saved!')
    } catch (e) {
      console.error('Failed to save rules:', e)
      alert('Failed to save rules')
    } finally {
      setSaving(false)
    }
  }

  const removeKeyword = (key: string, index: number) => {
    setRules((r: any) => ({
      ...r,
      [key]: (r[key] || []).filter((_: any, i: number) => i !== index)
    }))
  }

  const addKeyword = (key: string, value: string) => {
    if (!value.trim()) return
    setRules((r: any) => ({
      ...r,
      [key]: [...(r[key] || []), value.trim()]
    }))
  }

  const pills = (key: string, placeholder: string) => (
    <div className="flex flex-wrap gap-2 items-center">
      {(rules[key] || []).map((k: string, i: number) => (
        <span
          key={i}
          className="text-xs bg-muted px-2 py-0.5 rounded flex items-center gap-1"
        >
          {k}
          <button
            type="button"
            onClick={() => removeKeyword(key, i)}
            className="hover:text-red-600"
          >
            ×
          </button>
        </span>
      ))}
      <Input
        placeholder={placeholder}
        className="w-48 h-8"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const val = (e.target as HTMLInputElement).value.trim()
            if (val) {
              addKeyword(key, val)
              ;(e.target as HTMLInputElement).value = ''
            }
            e.preventDefault()
          }
        }}
      />
    </div>
  )

  return (
    <div className="rounded border p-4 space-y-4">
      <div className="font-medium">Reply Rules</div>
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          ['stop_on_reply', 'Stop on any reply'],
          ['stop_on_unsubscribe', 'Stop on unsubscribe'],
          ['stop_on_ooh', 'Pause on out-of-office'],
          ['stop_on_bounce', 'Stop on bounce'],
        ].map(([k, label]) => (
          <div key={k} className="flex items-center justify-between">
            <Label>{label}</Label>
            <Switch
              checked={!!rules[k]}
              onCheckedChange={(v) => setRules((r: any) => ({ ...r, [k]: v }))}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Custom positive keywords (mark as reply)</Label>
        {pills('custom_positive_keywords', 'add keyword…')}
      </div>
      <div className="space-y-2">
        <Label>Custom negative keywords (mark as reply)</Label>
        {pills('custom_negative_keywords', 'add keyword…')}
      </div>
      <div className="space-y-2">
        <Label>Autoresponder keywords</Label>
        {pills('autoresponder_keywords', 'add keyword…')}
      </div>

      <div className="pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save rules'}
        </Button>
      </div>
    </div>
  )
}

