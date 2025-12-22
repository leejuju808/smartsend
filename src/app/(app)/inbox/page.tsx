// @ts-nocheck
// app/(app)/inbox/page.tsx  (skeleton idea)
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ReplyTemplates } from '@/components/inbox/ReplyTemplates'
import { LabelFilter } from '@/components/inbox/LabelFilter'
import { LabelPill } from '@/components/inbox/LabelPill'
import { FollowUpButton } from '@/components/ai/FollowUpButton'
import { TriageTabs } from '@/components/inbox/TriageTabs'
import { AssigneeFilter } from '@/components/inbox/AssigneeFilter'
import { AssignDropdown } from '@/components/inbox/AssignDropdown'
import { SearchAndFilters } from '@/components/inbox/SearchAndFilters'
import { ThreadList } from '@/components/inbox/ThreadList'
import { CallToCallButton } from '@/components/inbox/CallToCallButton'
import { CallOutcomeModal, CallOutcome } from '@/components/inbox/CallOutcomeModal'
import { AppointmentBookingModal } from '@/components/inbox/AppointmentBookingModal'
import { toast } from 'sonner'
import { createClientComponentClient } from '@/lib/supabase'

type Thread = {
  id: string
  subject: string | null
  last_ai_label: string | null
  status: string
  updated_at: string
  assigned_to: string | null
  campaign_id: string | null
  last_message_at: string | null
  unread_inbound?: number | null
  stopped_by_reply?: boolean | null
}

type Message = {
  id: string
  direction: 'in' | 'out'
  from_email: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  received_at: string
  reply_label: string | null
  provider_thread_id?: string | null
}

type Detail = {
  messages: Message[]
  lead: any
  thread: {
    user_id: string
    mailbox_id: string | null
    lead_id: string | null
    campaign_id: string | null
  }
  provider?: 'gmail' | 'outlook'
  provider_thread_id?: string | null
}

type GuardIssue = {
  rule: string
  msg: string
  severity: 'info' | 'warn' | 'error'
}

type GuardResult = {
  blocked: boolean
  draft: string
  issues: GuardIssue[]
}

type PersonalizationMeta = {
  role_hint?: string | null
  tech_stack?: string[] | null
  industry?: string | null
  region?: string | null
  score?: number | null
}

export default function InboxPage() {
  const searchParams = useSearchParams()
  const [threads, setThreads] = useState<Thread[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [nudgeEventId, setNudgeEventId] = useState<string | null>(null)
  const [aiDraftBaseline, setAiDraftBaseline] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState('open')
  const [guardIssues, setGuardIssues] = useState<GuardIssue[]>([])
  const [guardBlocked, setGuardBlocked] = useState(false)
  const [guardVars, setGuardVars] = useState<{ my_meeting_link?: string; org_address?: string } | null>(null)
  const [personalizationStatus, setPersonalizationStatus] = useState<{ line: string; meta: PersonalizationMeta | null } | null>(null)
  const [showCallOutcomeModal, setShowCallOutcomeModal] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)

  const loadThreads = async () => {
    const params = new URLSearchParams({ status })
    const label = searchParams.get('label')
    if (label && label !== 'All') {
      params.set('label', label)
    }
    const campaignId = searchParams.get('campaign_id')
    if (campaignId) {
      params.set('campaign_id', campaignId)
    }
    const r = await fetch(`/api/inbox?${params.toString()}`)
    if (r.ok) {
      const json = await r.json()
      setThreads(json.threads || [])
    }
  }

  const loadDetail = async (threadId: string) => {
    // Try to load detail using thread id
    const r = await fetch(`/api/inbox/thread?id=${encodeURIComponent(threadId)}`)
    if (r.ok) {
      const json = await r.json()
      // Adapt the response to match expected Detail type
      const leadPayload = json.lead ?? json.lead_info ?? null
      setDetail({
        messages: json.messages || [],
        lead: leadPayload,
        thread: {
          id: json.thread?.id || threadId,
          thread_key: json.thread?.thread_key || threadId,
          user_id: json.thread?.user_id || '',
          mailbox_id: json.thread?.mailbox_id ?? null,
          lead_id: json.thread?.lead_id || leadPayload?.id || null,
          campaign_id: json.thread?.campaign_id || null,
          assigned_to: json.thread?.assigned_to || json.thread?.assignee_id || null,
          assignee_id: json.thread?.assignee_id || json.thread?.assigned_to || null,
          subject: json.thread?.subject || null,
        },
        provider: json.provider ?? 'gmail',
        provider_thread_id: json.provider_thread_id ?? null,
      })
      setActive(threadId)
      setNudgeEventId(null)
      setAiDraftBaseline(null)
      setGuardIssues([])
      setGuardBlocked(false)
      setPersonalizationStatus(null)
    }
  }

  useEffect(() => {
    loadThreads()
  }, [status, searchParams])

  const supabase = useMemo(() => createClientComponentClient(), [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!active) return
        setUserId(user?.id ?? null)
      } catch (err) {
        console.error('Failed to load session user', err)
        if (!active) return
        setUserId(null)
      }
    })()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/compliance/guard')
        if (!res.ok) return
        const data = await res.json()
        if (data?.config) {
          setGuardVars({
            my_meeting_link: data.config.my_meeting_link ?? undefined,
            org_address: data.config.org_address ?? undefined,
          })
        }
      } catch (err) {
        console.error('Failed to load compliance guard defaults', err)
      }
    })()
  }, [])

  const captureNudgeEdit = async (finalDraft: string, accepted: boolean) => {
    if (!userId || !nudgeEventId || !aiDraftBaseline) return
    try {
      await fetch('/functions/v1/nudge-edit-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: userId,
          event_id: nudgeEventId,
          draft_before: aiDraftBaseline,
          draft_after: finalDraft,
          accepted,
        }),
      })
    } catch (err) {
      console.error('nudge-edit-submit failed', err)
    }
  }

  const send = async () => {
    if (!detail?.thread || !active) return

    const html = body.replace(/\n/g, '<br/>')
    
    // Determine recipient email
    const recipientEmail = detail.lead?.email || detail.messages?.find((m: Message) => m.direction === 'in')?.from_email || ''
    if (!recipientEmail) {
      alert('Cannot determine recipient email')
      return
    }

    // Determine subject (reply subject or original)
    const originalSubject = detail.messages?.[0]?.subject || ''
    const replySubject = subject || (originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`)
    
    // Create a proxy route that calls the Edge function
    const res = await fetch('/api/inbox/send-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_key: active,
        user_id: detail.thread.user_id,
        mailbox_id: detail.thread.mailbox_id,
        to: recipientEmail,
        subject: replySubject,
        body_html: html,
        body_text: body,
        provider: detail.provider || 'gmail',
        provider_thread_id: detail.provider_thread_id || null,
        nudge_event_id: nudgeEventId,
      })
    })

    if (res.ok) {
      await captureNudgeEdit(body, true)
      const directEdge = process.env.NEXT_PUBLIC_EDGE_URL
      const supabaseEdge = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
        : undefined
      const tickBase = (directEdge || supabaseEdge)?.replace(/\/$/, '')
      if (tickBase) {
        fetch(`${tickBase}/send-tick`, { method: 'POST' }).catch((err) => {
          console.error('send-tick trigger failed', err)
        })
      }
      setBody('')
      setSubject('')
      setNudgeEventId(null)
      setAiDraftBaseline(null)
      setGuardIssues([])
      setGuardBlocked(false)
      setPersonalizationStatus(null)
      await loadDetail(active)
      await loadThreads()
    } else {
      const data = await res.json().catch(() => null)
      if (res.status === 422 && data?.guard) {
        const guard: GuardResult = {
          blocked: Boolean(data.guard.blocked),
          draft: typeof data.guard.draft === 'string' ? data.guard.draft : body,
          issues: Array.isArray(data.guard.issues) ? data.guard.issues : [],
        }
        setGuardIssues(guard.issues)
        setGuardBlocked(guard.blocked)
        if (guard.draft && guard.draft !== body) {
          setBody(guard.draft)
        }
        toast.error('Compliance Guard blocked this draft. Review issues before sending.')
      } else if (data?.error) {
        toast.error(data.error)
      } else {
        toast.error('Failed to send reply')
      }
    }
  }

  const applyTemplate = (tpl: any) => {
    setSubject(tpl.subject || '')
    // Variable merge
    const vars = {
      first_name: detail?.lead?.first_name || '',
      name: `${detail?.lead?.first_name || ''} ${detail?.lead?.last_name || ''}`.trim() || '',
      company: detail?.lead?.company || '',
      my_name: '', // TODO: fill from profile if available
    }
    const merged = tpl.body_md.replace(/{{\s*(\w+)\s*}}/g, (_: string, k: string) => (vars as any)[k] ?? '')
    setBody(merged)
    setNudgeEventId(null)
    setAiDraftBaseline(null)
    setGuardIssues([])
    setGuardBlocked(false)
    setPersonalizationStatus(null)
  }

  const campaignId = searchParams.get('campaign_id') || undefined

  const latestInboundMessage = useMemo(() => {
    if (!detail?.messages?.length) return null
    for (let i = detail.messages.length - 1; i >= 0; i--) {
      const msg = detail.messages[i]
      if (msg.direction === 'in') return msg
    }
    return null
  }, [detail?.messages])

  const baseMergeVars = useMemo(() => {
    if (!detail) return null
    const lead = detail.lead || {}
    const vars: Record<string, any> = {}
    const firstName = lead.first_name || lead.firstname || lead.given_name || null
    if (firstName) vars.first_name = firstName
    const lastName = lead.last_name || lead.lastname || null
    if (lastName) vars.last_name = lastName
    const company =
      lead.company ||
      lead.company_name ||
      lead.organization ||
      lead.account ||
      lead.account_name ||
      null
    if (company) vars.company = company
    if (lead.title || lead.role) vars.role = lead.title || lead.role
    if (lead.email) vars.email = lead.email
    if (!Object.keys(vars).length && latestInboundMessage?.from_email) {
      const inferred = latestInboundMessage.from_email.split('@')[1]?.split('.')[0]
      if (inferred) vars.company = inferred
    }
    return Object.keys(vars).length ? vars : null
  }, [detail, latestInboundMessage])

  const personalizationVars = useMemo(() => {
    const payload: Record<string, any> = {}
    if (baseMergeVars) Object.assign(payload, baseMergeVars)
    if (guardVars?.my_meeting_link) payload.my_meeting_link = guardVars.my_meeting_link
    if (guardVars?.org_address) payload.org_address = guardVars.org_address
    return Object.keys(payload).length ? payload : null
  }, [baseMergeVars, guardVars])

  const leadContext = useMemo(() => {
    if (!detail?.lead) return null
    const lead = detail.lead
    const ctx: { industry?: string; role?: string; tech_stack?: string[]; region?: string } = {}
    const role = lead.title || lead.role || null
    if (role) ctx.role = role
    const industry = lead.industry || lead.segment || lead.vertical || null
    if (industry) ctx.industry = industry
    const region = lead.region || lead.geo || lead.location || null
    if (region) ctx.region = region
    let techStack: string[] | null = null
    if (Array.isArray(lead.tech_stack)) {
      techStack = lead.tech_stack
    } else if (typeof lead.tech_stack === 'string') {
      techStack = lead.tech_stack
        .split(/[,;]+/)
        .map((item: string) => item.trim())
        .filter(Boolean)
    } else if (Array.isArray(lead.enrichment?.tech_stack)) {
      techStack = lead.enrichment.tech_stack
    }
    if (techStack && techStack.length) ctx.tech_stack = techStack
    return Object.keys(ctx).length ? ctx : null
  }, [detail?.lead])

  const personalizationBadge = useMemo(
    () => formatPersonalizationMeta(personalizationStatus?.meta ?? null),
    [personalizationStatus]
  )

  const latestInboundLabel = useMemo(() => {
    if (!detail?.messages?.length) return null
    const inbound = [...detail.messages].reverse().find((m) => m.direction === 'in' && m.reply_label)
    if (inbound?.reply_label) return inbound.reply_label
    const threadMatch = active ? threads.find((t) => t.id === active) : null
    return threadMatch?.last_ai_label || null
  }, [detail?.messages, active, threads])

  const threadSummary = useMemo(() => {
    if (!detail?.messages?.length) return null
    return detail.messages
      .slice(-6)
      .map((m) => {
        const speaker = m.direction === 'in' ? 'Lead' : 'You'
        const source = (m.body_text || '')
          .replace(/\s+/g, ' ')
          .trim()
        const preview = source.length > 280 ? `${source.slice(0, 277)}...` : source
        return `${speaker}: ${preview || '[no content]'}`;
      })
      .join('\n')
  }, [detail?.messages])

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="border-b p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TriageTabs campaignId={campaignId} />
          <div className="flex gap-2">
            <AssigneeFilter campaignId={campaignId} />
            <LabelFilter />
          </div>
        </div>
        <SearchAndFilters />
        <div className="flex gap-2">
          <Button
            variant={status === 'open' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus('open')}
          >
            Open
          </Button>
          <Button
            variant={status === 'archived' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus('archived')}
          >
            Archived
          </Button>
          <Button
            variant={status === 'snoozed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus('snoozed')}
          >
            Snoozed
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-12 flex-1 overflow-hidden">
        <div className="col-span-4 border-r overflow-auto p-4">
          <ThreadList 
            threads={threads}
            activeThreadId={active}
            onThreadClick={loadDetail}
          />
        </div>
        <div className="col-span-8 flex flex-col overflow-hidden">
          {detail && active && (
            <div className="border-b p-4 flex items-center justify-between">
              <h1 className="text-lg font-semibold truncate">
                {detail.thread?.subject || detail.messages?.[0]?.subject || "(no subject)"}
              </h1>
              <div className="flex items-center gap-2">
                {detail.lead && (
                  <CallToCallButton
                    contactPhone={detail.lead.phone}
                    threadMessages={detail.messages}
                    contactId={detail.lead.id}
                    threadId={active}
                    onCallInitiated={() => {
                      // Show outcome modal after a short delay (simulating call completion)
                      setTimeout(() => {
                        setShowCallOutcomeModal(true)
                      }, 2000)
                    }}
                  />
                )}
                {detail.thread?.campaign_id && (
                  <AssignDropdown
                    thread={{
                      id: detail.thread.id || active,
                      thread_key: detail.thread.thread_key || active,
                      campaign_id: detail.thread.campaign_id,
                      assigned_to: detail.thread.assigned_to || null,
                      assignee_id: detail.thread.assignee_id || detail.thread.assigned_to || null,
                    }}
                  />
                )}
              </div>
            </div>
          )}
          {/* AI Insights Panel */}
          {detail?.thread && (detail.thread as any).ai_summary && (
            <div className="p-4 border-b bg-white">
              <h3 className="font-semibold text-lg mb-3">AI Insights</h3>
              {(detail.thread as any).ai_summary && (
                <p className="text-sm mt-2">
                  <strong>Summary:</strong> {(detail.thread as any).ai_summary}
                </p>
              )}
              {(detail.thread as any).ai_tone && (
                <p className="text-sm mt-2">
                  <strong>Tone:</strong>{" "}
                  <span className={`capitalize ${
                    (detail.thread as any).ai_tone === 'positive' ? 'text-green-600' :
                    (detail.thread as any).ai_tone === 'negative' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {(detail.thread as any).ai_tone}
                  </span>
                </p>
              )}
              {(detail.thread as any).ai_buyer_role && (
                <p className="text-sm mt-2">
                  <strong>Buyer Role:</strong>{" "}
                  <span className="capitalize">
                    {String((detail.thread as any).ai_buyer_role).replace('_', ' ')}
                  </span>
                </p>
              )}
              {(detail.thread as any).ai_opportunity_score !== null && (detail.thread as any).ai_opportunity_score !== undefined && (
                <p className="text-sm mt-2">
                  <strong>Opportunity:</strong> {(detail.thread as any).ai_opportunity_score}/10
                </p>
              )}
              {(detail.thread as any).ai_action_items && Array.isArray((detail.thread as any).ai_action_items) && (detail.thread as any).ai_action_items.length > 0 && (
                <div className="mt-2">
                  <strong className="text-sm">Action Items:</strong>
                  <ul className="list-disc pl-6 text-sm mt-1">
                    {(detail.thread as any).ai_action_items.map((a: string, i: number) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(detail.thread as any).ai_objections && Array.isArray((detail.thread as any).ai_objections) && (detail.thread as any).ai_objections.length > 0 && (
                <div className="mt-2">
                  <strong className="text-sm">Objections:</strong>
                  <ul className="list-disc pl-6 text-sm mt-1">
                    {(detail.thread as any).ai_objections.map((o: string, i: number) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {detail?.messages?.map((m) => (
              <div
                key={m.id}
                className={`rounded p-3 border ${
                  m.direction === 'in' ? 'bg-white' : 'bg-muted'
                }`}
              >
                <div className="text-xs text-muted-foreground">
                  {m.direction === 'in' ? 'From lead' : 'You'} •{' '}
                  {new Date(m.received_at).toLocaleString()}
                </div>
                <div
                  className="prose prose-sm max-w-none mt-2"
                  dangerouslySetInnerHTML={{
                    __html: m.body_html || (m.body_text || '').replace(/\n/g, '<br/>'),
                  }}
                />
              </div>
            ))}
          </div>
          {!!active && (
            <div className="border-t p-3 space-y-2">
              <ReplyTemplates onPick={applyTemplate} />
              <div className="flex items-center justify-between gap-2">
                <Input
                  placeholder="Subject (optional)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <FollowUpButton
                  threadId={active}
                  label={latestInboundLabel}
                  threadSummary={threadSummary}
                  setDraft={(draft) => {
                    setBody(draft)
                    setAiDraftBaseline(draft || null)
                  }}
                  guardVars={guardVars ?? undefined}
                  campaignId={detail.thread?.campaign_id ?? null}
                  mergeVars={personalizationVars ?? undefined}
                  leadContext={leadContext ?? undefined}
                  onGenerated={({ eventId, personalizationApplied, personalizationLine, personalizationMeta, draft }) => {
                    setNudgeEventId(eventId ?? null)
                    setAiDraftBaseline(draft ?? null)
                    if (personalizationApplied && personalizationLine) {
                      setPersonalizationStatus({
                        line: personalizationLine,
                        meta: personalizationMeta ?? null,
                      })
                    } else {
                      setPersonalizationStatus(null)
                    }
                  }}
                  onGuardResult={(guard) => {
                    setGuardIssues(guard.issues || [])
                    setGuardBlocked(Boolean(guard.blocked))
                  }}
                />
              </div>
              {personalizationStatus && (
                <div className="flex flex-col gap-0.5 text-xs text-emerald-700">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 font-semibold">
                      Personalized ✓
                    </span>
                    {personalizationBadge && <span className="truncate">{personalizationBadge}</span>}
                  </div>
                  <span className="line-clamp-2 text-emerald-600">{personalizationStatus.line}</span>
                </div>
              )}
              <Textarea
                rows={6}
                placeholder="Type your reply…"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  if (!aiDraftBaseline) {
                    setNudgeEventId(null)
                  }
                  if (!e.target.value.trim()) {
                    setAiDraftBaseline(null)
                  }
                  setGuardBlocked(false)
                  setGuardIssues([])
                  setPersonalizationStatus(null)
                }}
              />
              {guardIssues.length > 0 && (
                <div className="rounded border border-dashed p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Compliance Guard issues</div>
                    {guardBlocked && <span className="text-xs font-semibold text-red-600 uppercase">Blocked</span>}
                  </div>
                  <ul className="space-y-1 text-xs">
                    {guardIssues.map((issue, idx) => (
                      <li key={`${issue.rule}-${idx}`} className="flex items-start gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                            issue.severity === 'error'
                              ? 'bg-red-500/10 text-red-600'
                              : issue.severity === 'warn'
                              ? 'bg-amber-400/10 text-amber-600'
                              : 'bg-blue-500/10 text-blue-600'
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span>
                          <strong>{issue.rule}</strong> — {issue.msg}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={send} disabled={guardBlocked}>
                  {guardBlocked ? 'Resolve guard issues' : 'Send'}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await fetch(`/api/inbox/threads/${encodeURIComponent(active)}/actions`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'mark_read' }),
                    })
                    await loadThreads()
                    if (detail) await loadDetail(active)
                  }}
                >
                  Mark read
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await fetch(`/api/inbox/threads/${encodeURIComponent(active)}/actions`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'archive' }),
                    })
                    setActive(null)
                    await loadThreads()
                  }}
                >
                  Archive
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Outcome Modal */}
      {detail?.lead && active && (
        <CallOutcomeModal
          open={showCallOutcomeModal}
          onOpenChange={setShowCallOutcomeModal}
          contactId={detail.lead.id}
          threadId={active}
          onOutcomeSelected={(outcome: CallOutcome) => {
            if (outcome === 'booked_estimate') {
              setShowAppointmentModal(true)
            } else {
              toast.success('Call outcome logged')
              loadDetail(active)
              loadThreads()
            }
          }}
        />
      )}

      {/* Appointment Booking Modal */}
      {detail?.lead && active && (
        <AppointmentBookingModal
          open={showAppointmentModal}
          onOpenChange={setShowAppointmentModal}
          contactId={detail.lead.id}
          threadId={active}
          contactPhone={detail.lead.phone}
          contactAddress={detail.lead.address}
          jobType={(detail.thread as any)?.ai_job_type || null}
          onBookingComplete={() => {
            toast.success('Appointment booked successfully!')
            loadDetail(active)
            loadThreads()
          }}
        />
      )}
    </div>
  )
}

function formatPersonalizationMeta(meta: PersonalizationMeta | null): string {
  if (!meta) return ''
  const parts: string[] = []
  if (meta.role_hint) parts.push(meta.role_hint)
  if (meta.tech_stack && meta.tech_stack.length > 0) {
    parts.push(meta.tech_stack.slice(0, 2).join(' • '))
  }
  if (parts.length === 0 && meta.industry) parts.push(meta.industry)
  if (parts.length === 0 && meta.region) parts.push(meta.region)
  return parts.length ? `(${parts.join(' • ')})` : ''
}

