'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

type ReplyRow = {
  id: string; user_id: string; campaign_id: string; lead_id: string;
  from_email: string; subject: string | null; snippet: string | null;
  provider_email: string; received_at: string; thread_id: string | null;
  is_starred: boolean; is_archived: boolean
}

export default function RepliesInbox() {
  const sb = supabaseBrowser()
  const [rows, setRows] = useState<ReplyRow[]>([])
  const [selected, setSelected] = useState<ReplyRow | null>(null)
  const [filter, setFilter] = useState<'all'|'starred'|'unread'|'archived'|'active'>('all')
  const [noteText, setNoteText] = useState('')
  const [replyText, setReplyText] = useState('')
  const [subject, setSubject] = useState('Re: ')
  const [me, setMe] = useState<string|undefined>()

  const load = async () => {
    const { data: user } = await sb.auth.getUser()
    setMe(user.data.user?.id)
    const q = sb.from('replies_inbox').select('*').order('received_at', { ascending: false }).limit(200)
    const { data, error } = await q
    if (error) console.error(error)
    setRows((data || []) as any)
    if (!selected && (data || [])[0]) {
      setSelected((data || [])[0] as any)
    }
  }

  const filtered = useMemo(() => {
    let out = rows
    if (filter === 'starred') out = out.filter(r => r.is_starred && !r.is_archived)
    if (filter === 'archived') out = out.filter(r => r.is_archived)
    if (filter === 'active') out = out.filter(r => !r.is_archived)
    return out
  }, [rows, filter])

  // realtime: bump when new replies land
  useEffect(() => {
    load()
    const ch = sb.channel('realtime:replies_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies_inbox' }, load)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])

  const toggleStar = async (row: ReplyRow) => {
    const { error } = await sb.from('replies_inbox')
      .update({ is_starred: !row.is_starred })
      .eq('id', row.id)
    if (error) toast.error('Could not update star'); else load()
  }

  const toggleArchive = async (row: ReplyRow) => {
    const { error } = await sb.from('replies_inbox')
      .update({ is_archived: !row.is_archived })
      .eq('id', row.id)
    if (error) toast.error('Could not update archive'); else load()
  }

  const addNote = async () => {
    if (!selected || !noteText.trim() || !me) return
    const { error } = await sb.from('reply_notes').insert({
      user_id: me, campaign_id: selected.campaign_id, lead_id: selected.lead_id, body: noteText.trim()
    })
    if (error) toast.error('Note failed'); else { setNoteText(''); toast.success('Note added') }
  }

  const sendQuickReply = async () => {
    if (!selected || !me) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) { toast.error('Configuration error'); return }
    const res = await fetch(`${supabaseUrl}/functions/v1/send_quick_reply`, {
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        user_id: me, to: selected.from_email,
        subject: subject || `Re: ${selected.subject || ''}`,
        body: replyText, thread_id: selected.thread_id
      })
    })
    if (!res.ok) { toast.error('Send failed'); return }
    setReplyText('')
    toast.success('Reply sent')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* List */}
      <Card className="rounded-2xl shadow-sm lg:col-span-1">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant={filter==='all'?'default':'outline'} onClick={()=>setFilter('all')}>All</Button>
            <Button size="sm" variant={filter==='active'?'default':'outline'} onClick={()=>setFilter('active')}>Active</Button>
            <Button size="sm" variant={filter==='starred'?'default':'outline'} onClick={()=>setFilter('starred')}>Starred</Button>
            <Button size="sm" variant={filter==='archived'?'default':'outline'} onClick={()=>setFilter('archived')}>Archived</Button>
          </div>
          <div className="divide-y">
            {filtered.map(r => (
              <div key={r.id}
                className={`py-3 cursor-pointer ${selected?.id===r.id ? 'bg-muted/40 rounded-xl px-2' : 'px-2'}`}
                onClick={()=>setSelected(r)}>
                <div className="flex items-center justify-between">
                  <div className="font-medium truncate">{r.from_email}</div>
                  <button
                    className={`text-xs ${r.is_starred?'text-yellow-600':'text-muted-foreground'}`}
                    onClick={(e)=>{ e.stopPropagation(); toggleStar(r) }}>
                    ★
                  </button>
                </div>
                <div className="text-sm text-muted-foreground truncate">{r.subject || '(no subject)'}</div>
                <div className="text-xs text-muted-foreground truncate">{r.snippet}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(r.received_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Thread / Actions */}
      <Card className="rounded-2xl shadow-sm lg:col-span-2">
        <CardContent className="p-5 space-y-4">
          {!selected ? (
            <div className="text-muted-foreground">Select a reply to view and respond.</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{selected.from_email}</div>
                  <div className="text-sm text-muted-foreground">{selected.subject || '(no subject)'}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={selected.is_starred?'default':'outline'} onClick={()=>toggleStar(selected)}>
                    {selected.is_starred ? 'Starred' : 'Star'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={()=>toggleArchive(selected)}>
                    {selected.is_archived ? 'Unarchive' : 'Archive'}
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 text-sm">
                <div className="mb-1 font-medium">Latest snippet</div>
                <div className="text-muted-foreground whitespace-pre-wrap">{selected.snippet || '—'}</div>
              </div>

              {/* Quick reply */}
              <div className="space-y-2">
                <Input placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)} />
                <Textarea rows={5} placeholder="Type your reply…" value={replyText} onChange={e=>setReplyText(e.target.value)} />
                <div className="flex gap-2">
                  <Button onClick={sendQuickReply}>Send Reply</Button>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Notes</div>
                <div className="flex gap-2">
                  <Input placeholder="Add a note…" value={noteText} onChange={e=>setNoteText(e.target.value)} />
                  <Button variant="outline" onClick={addNote}>Add</Button>
                </div>
                <ThreadNotes campaignId={selected.campaign_id} leadId={selected.lead_id} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ThreadNotes({ campaignId, leadId }: { campaignId: string; leadId: string }) {
  const sb = supabaseBrowser()
  const [notes, setNotes] = useState<any[]>([])
  useEffect(() => {
    (async () => {
      const { data } = await sb.from('reply_notes')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
      setNotes(data || [])
    })()
  }, [campaignId, leadId])
  return (
    <div className="space-y-2">
      {notes.map(n => (
        <div key={n.id} className="text-xs text-muted-foreground">
          <span className="font-medium">{new Date(n.created_at).toLocaleString()}:</span> {n.body}
        </div>
      ))}
    </div>
  )
}

