'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/badge'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { toast } from 'sonner'

export default function OutboxTable() {
  const sb = supabaseBrowser()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await sb
        .from('send_logs')
        .select('id, recipient_email, subject, sent_at, status, error, retry_count, open_count, clicks_count, opened_at, replied_at')
        .order('sent_at', { ascending: false })
        .limit(50)
      
      if (error) {
        console.error('Error loading logs:', error)
        toast.error('Failed to load outbox')
      } else {
        setLogs(data || [])
      }
    } catch (err) {
      console.error('Error loading logs:', err)
      toast.error('Failed to load outbox')
    } finally {
      setLoading(false)
    }
  }

  const resend = async (logId: string) => {
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user?.id) {
        toast.error('Not authenticated')
        return
      }

      const { data, error } = await sb.functions.invoke('resend_email', {
        body: { log_id: logId, user_id: user.id }
      })

      if (error) {
        throw new Error(error.message || 'Failed to resend')
      }

      toast.success('Email re-queued successfully!')
      load()
    } catch (err: any) {
      console.error('Resend error:', err)
      toast.error(err.message || 'Resend failed.')
    }
  }

  useEffect(() => {
    load()
    
    // Set up realtime subscription
    const channel = sb.channel('realtime:send_logs')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'send_logs' 
      }, () => {
        load()
      })
      .subscribe()

    return () => { 
      sb.removeChannel(channel) 
    }
  }, [])

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold mb-3">Outbox</h2>
        {loading ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="pb-2">Recipient</th>
                  <th className="pb-2">Subject</th>
                  <th className="pb-2">Engagement</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Sent At</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No emails sent yet
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2">{log.recipient_email || '—'}</td>
                      <td className="py-2">{log.subject || '—'}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          {log.replied_at ? (
                            <Badge variant="default">Replied</Badge>
                          ) : (
                            <Badge variant="secondary">No Reply</Badge>
                          )}
                          <Badge variant={log.open_count > 0 ? "default" : "secondary"}>
                            {log.open_count || 0} Open{(log.open_count || 0) === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant={log.clicks_count > 0 ? "default" : "secondary"}>
                            {log.clicks_count || 0} Click{(log.clicks_count || 0) === 1 ? "" : "s"}
                          </Badge>
                        </div>
                      </td>
                      <td className={`py-2 ${log.status === 'failed' ? 'text-red-500' : 'text-green-600'}`}>
                        {log.status || (log.error ? 'failed' : 'sent')}
                      </td>
                      <td className="py-2">
                        {log.sent_at ? new Date(log.sent_at).toLocaleString() : '—'}
                      </td>
                      <td className="py-2">
                        {(log.status === 'failed' || (log.error && !log.status)) && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => resend(log.id)}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

