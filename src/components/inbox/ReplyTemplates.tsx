// components/inbox/ReplyTemplates.tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

export function ReplyTemplates({ onPick }: { onPick: (tpl: any) => void }) {
  const [templates, setTemplates] = useState<any[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        // Try org first (if you store current_org_id), else user
        const r = await fetch('/api/orgs/list')
        const j = r.ok ? await r.json() : { currentOrgId: null, current: null }
        const currentOrgId = j?.currentOrgId || j?.current || null
        const scope = currentOrgId ? 'org' : 'user'
        const ownerId = currentOrgId || 'me' // server resolves 'me' to auth.uid() and handles org lookup

        const t = await fetch(`/api/templates?scope=${scope}&ownerId=${ownerId}`)
        if (t.ok) {
          const json = await t.json()
          setTemplates(json.templates || [])
        }
      } catch (err) {
        console.error('Error loading templates:', err)
      }
    })()
  }, [])

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
        Templates {open ? '▼' : '▶'}
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50 w-80 max-h-60 overflow-auto">
          {templates.length === 0 && (
            <div className="p-2 text-xs text-muted-foreground">No templates yet.</div>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onPick(t)
                setOpen(false)
              }}
              className="w-full text-left p-2 hover:bg-muted cursor-pointer"
            >
              <div className="space-y-1">
                <div className="text-sm">{t.name}</div>
                {t.subject ? (
                  <div className="text-xs text-muted-foreground">{t.subject}</div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

