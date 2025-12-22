'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { supabaseBrowser } from '@/lib/supabase-browser'

export default function RepliesList() {
  const sb = supabaseBrowser()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await sb
        .from('send_logs')
        .select('id, recipient_email, replied_at, reply_source, reply_summary')
        .not('replied_at', 'is', null)
        .gte('replied_at', sevenDaysAgo)
        .order('replied_at', { ascending: false })
      
      if (error) {
        console.error('Error loading replies:', error)
      } else {
        setRows(data || [])
      }
    } catch (err) {
      console.error('Error loading replies:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    
    // Set up realtime subscription for new replies
    const channel = sb.channel('realtime:replies')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'send_logs',
        filter: 'replied_at=neq.null'
      }, () => {
        load()
      })
      .subscribe()

    return () => { 
      sb.removeChannel(channel) 
    }
  }, [])

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 space-y-3">
        <div className="text-sm font-medium">Replies (last 7 days)</div>
        {loading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No replies yet</div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="border rounded-xl p-3 hover:bg-muted/50">
                <div className="text-sm font-medium">{r.recipient_email}</div>
                <div className="text-xs text-muted-foreground">
                  {r.reply_source?.toUpperCase() || 'UNKNOWN'} • {new Date(r.replied_at).toLocaleString()}
                </div>
                <p className="text-sm mt-1 line-clamp-2">{r.reply_summary ?? "(no preview)"}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

