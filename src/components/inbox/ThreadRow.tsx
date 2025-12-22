'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

type Role = 'owner' | 'editor' | 'viewer' | null

type Thread = {
  id: string
  subject: string | null
  from_email: string | null
  last_message_at: string | null
  status: 'open'|'replied'|'archived'|'snoozed'
  snooze_until: string | null
  cooldown_until: string | null
  ai_last_reply_kind?: string | null
  last_ai_label?: string | null
  last_ai_intent?: string | null
  campaign_id?: string | null
  stopped_by_reply?: boolean | null
  lead?: {
    do_not_contact?: boolean | null
    email_status?: string | null
  } | null
}

export function ThreadRow({ t, role, onChanged, selected, onToggle }:{
  t:Thread, role:Role, onChanged:()=>void,
  selected: boolean, onToggle: (id: string, val: boolean)=>void
}) {
  const [pending, start] = useTransition()
  const canTriage = role === 'owner' || role === 'editor'
  const [openSnooze, setOpenSnooze] = useState(false)
  const [snoozeUntil, setSnoozeUntil] = useState<string>('')

  function callStatus(status: Thread['status'], extra?: any) {
    start(async () => {
      const r = await fetch(`/api/threads/${t.id}/status`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extra })
      })
      if (r.ok) onChanged()
    })
  }

  const ActionBtn = ({ children, onClick }:{ children: React.ReactNode, onClick:()=>void }) => (
    <TooltipProvider>
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary" 
              size="sm"
              disabled={!canTriage || pending}
              onClick={onClick}
            >
              {children}
            </Button>
          </TooltipTrigger>
          {!canTriage && (
            <TooltipContent>Viewer access — ask owner for Editor to triage.</TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  )

  return (
    <div className={cn("flex items-center justify-between px-4 py-3 border-b relative", pending && "opacity-60")}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Checkbox checked={selected} onCheckedChange={(v)=>onToggle(t.id, !!v)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium truncate">{t.subject || '(no subject)'}</div>
            {t.stopped_by_reply && (
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                Replied
              </span>
            )}
            {/* Automation status chips */}
            {t.lead?.do_not_contact && (
              <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                Unsubscribed
              </span>
            )}
            {t.lead?.email_status === 'bounced' && (
              <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                Bounced
              </span>
            )}
            {t.snooze_until && new Date(t.snooze_until) > new Date() && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                OOO — snoozed until {new Date(t.snooze_until).toLocaleDateString()}
              </span>
            )}
            {t.cooldown_until && new Date(t.cooldown_until) > new Date() && (
              <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                Cooling 30d
              </span>
            )}
            {t.last_ai_label && (
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                {t.last_ai_label}{t.last_ai_intent ? ` · ${t.last_ai_intent}` : ""}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {t.from_email} • {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        {t.ai_last_reply_kind && (
          <span className="text-xs px-2 py-0.5 rounded bg-muted">{t.ai_last_reply_kind}</span>
        )}
        <span className="text-xs px-2 py-0.5 rounded bg-muted">{t.status}</span>
        <ActionBtn onClick={()=>callStatus('replied')}>Mark replied</ActionBtn>
        <ActionBtn onClick={()=>callStatus('archived')}>Archive</ActionBtn>
        <ActionBtn onClick={()=>setOpenSnooze(true)}>Snooze</ActionBtn>
      </div>

      {openSnooze && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-background rounded-2xl p-4 shadow-lg w-[360px] space-y-3">
            <div className="text-sm font-medium">Snooze until</div>
            <input
              type="datetime-local"
              className="w-full border rounded-md px-3 py-2 bg-background"
              value={snoozeUntil}
              onChange={e=>setSnoozeUntil(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setOpenSnooze(false)}>Cancel</Button>
              <Button
                onClick={()=>{
                  callStatus('snoozed', { snooze_until: snoozeUntil ? new Date(snoozeUntil).toISOString() : null })
                  setOpenSnooze(false)
                }}
                disabled={!canTriage || pending || !snoozeUntil}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

