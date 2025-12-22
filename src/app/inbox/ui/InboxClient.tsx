'use client'

import { useCallback, useMemo, useState } from 'react'
import { InboxThread } from '@/lib/types'
import { useRealtimeReplies } from '@/hooks/useRealtimeReplies'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ThreadDrawer from './ThreadDrawer'
import { ReplyChip } from '@/components/inbox/ReplyChip'
import { EmptyState } from '@/components/EmptyState'
import { Inbox, Mail } from 'lucide-react'

const LABELS = ["", "positive","neutral","negative","unsubscribe","ooo","bounce","other"] as const;

function labelBadgeClass(label: string | null | undefined): string {
  switch (label) {
    case "positive": return "bg-green-600 text-white border-green-600";
    case "neutral": return "bg-slate-500 text-white border-slate-500";
    case "negative": return "bg-red-600 text-white border-red-600";
    case "unsubscribe": return "bg-orange-500 text-white border-orange-500";
    case "ooo": return "bg-blue-500 text-white border-blue-500";
    case "bounce": return "bg-rose-500 text-white border-rose-500";
    default: return "bg-gray-500 text-white border-gray-500";
  }
}

type Props = { initial: InboxThread[] }

export default function InboxClient({ initial }: Props) {
  const [threads, setThreads] = useState<InboxThread[]>(initial)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'human' | 'ooo' | 'bounce' | 'positive' | 'neutral' | 'negative' | 'unsubscribe' | 'other'>('all')
  const [labelFilter, setLabelFilter] = useState<string>('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<InboxThread | null>(null)

  const onRowUpdate = useCallback((patch: Partial<InboxThread> & { id: string }) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === patch.id ? { ...t, ...patch } as InboxThread : t))
    )
  }, [])

  useRealtimeReplies({ onRowUpdate })

  const filtered = useMemo(() => {
    let arr = threads
    if (filter === 'human') arr = arr.filter(t => t.reply_type === 'Human Reply')
    else if (filter === 'ooo') arr = arr.filter(t => (t.reply_type ?? '').includes('Office'))
    else if (filter === 'bounce') arr = arr.filter(t => (t.reply_type ?? '').includes('Bounce'))
    
    // Apply AI label filter
    if (labelFilter) {
      arr = arr.filter(t => t.last_ai_label === labelFilter)
    }
    
    const needle = q.trim().toLowerCase()
    if (!needle) return arr
    return arr.filter((t) =>
      [t.subject, t.from_email, t.to_email].some((v) =>
        (v ?? '').toLowerCase().includes(needle)
      )
    )
  }, [threads, q, filter, labelFilter])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Replies Inbox</h1>
        <Input
          placeholder="Search subject/sender/recipient…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => { setFilter('all'); setLabelFilter('') }}>All</Button>
        <Button variant={filter === 'human' ? 'default' : 'outline'} onClick={() => setFilter('human')}>Human Replies</Button>
        <Button variant={filter === 'ooo' ? 'default' : 'outline'} onClick={() => setFilter('ooo')}>Out of Office</Button>
        <Button variant={filter === 'bounce' ? 'default' : 'outline'} onClick={() => setFilter('bounce')}>Bounces</Button>
      </div>
      
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">AI Labels:</span>
        {LABELS.filter(l => l).map(l => (
          <Button
            key={l}
            variant={labelFilter === l ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLabelFilter(labelFilter === l ? '' : l)}
            className={labelFilter === l ? labelBadgeClass(l) : ''}
          >
            {l}
          </Button>
        ))}
      </div>

      <div className="grid gap-2">
        {filtered.length === 0 ? (
          <EmptyState
            title="No replies yet"
            subtitle="When you receive replies to your emails, they'll appear here for review and response."
            icon={Inbox}
          />
        ) : (
          filtered.map((t) => (
          <Card key={t.id} className="hover:shadow-md transition cursor-pointer" onClick={() => { setActive(t); setOpen(true) }}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{t.subject ?? '(no subject)'}</span>
                  {t.replied ? (
                    <Badge variant="default">Replied</Badge>
                  ) : (
                    <Badge variant="secondary">Awaiting</Badge>
                  )}
                  <ReplyChip state={t.reply_state} />
                  {/* AI Label badge */}
                  {t.last_ai_label && (
                    <Badge className={labelBadgeClass(t.last_ai_label)}>
                      {t.last_ai_label}
                    </Badge>
                  )}
                  {/* New: Type badge */}
                  {t.reply_type && (
                    <Badge
                      variant={
                        t.reply_type === 'Human Reply'
                          ? 'default'
                          : t.reply_type.includes('Office')
                          ? 'outline'
                          : t.reply_type.includes('Bounce')
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {t.reply_type}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  From {t.from_email ?? '—'} → {t.to_email ?? '—'}
                  {t.last_ai_intent && (
                    <span className="ml-2 text-xs opacity-70">
                      · {t.last_ai_intent}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : ''}
              </div>
            </CardContent>
          </Card>
          ))
        )}
      </div>

      <ThreadDrawer
        open={open}
        onClose={() => setOpen(false)}
        threadId={active?.id ?? null}
        threadMeta={{ subject: active?.subject ?? '', from_email: active?.from_email ?? '', to_email: active?.to_email ?? '' }}
      />
    </div>
  )
}

