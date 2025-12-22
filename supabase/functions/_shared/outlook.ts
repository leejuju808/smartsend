// Outlook provider adapter
// supabase/functions/_shared/outlook.ts
import { EmailProvider, SendResult, Mailbox, isExpiring } from './providers.ts'

export class OutlookProvider implements EmailProvider {
  constructor(private mb: Mailbox, private supabase: any) {}
  
  async ensureToken() {
    if (!isExpiring(this.mb.token_expires_at)) return
    
    const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('MS_CLIENT_ID')!,
        client_secret: Deno.env.get('MS_CLIENT_SECRET')!,
        grant_type: 'refresh_token',
        refresh_token: this.mb.refresh_token || '',
        scope: 'https://graph.microsoft.com/.default offline_access'
      })
    })
    
    const j = await r.json()
    if (!j.access_token) throw new Error('ms_refresh_failed')
    
    this.mb.access_token = j.access_token
    this.mb.token_expires_at = new Date(Date.now() + (j.expires_in || 3600)*1000).toISOString()
    
    await this.supabase.from('connected_accounts').update({
      access_token: this.mb.access_token, 
      token_expires_at: this.mb.token_expires_at
    }).eq('id', this.mb.id)
  }
  
  async send({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }): Promise<SendResult> {
    const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.mb.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }],
          from: { emailAddress: { address: from } }
        },
        saveToSentItems: true
      })
    })
    
    if (r.status === 401) return { ok:false, code:'401' }
    if (r.status === 429) return { ok:false, code:'429' }
    if (r.status >= 500) return { ok:false, code:String(r.status) }
    
    return { ok:true, id: crypto.randomUUID() }
  }
}

