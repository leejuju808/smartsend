// Gmail provider adapter
// supabase/functions/_shared/gmail.ts
import { EmailProvider, SendResult, Mailbox, isExpiring } from './providers.ts'

export class GmailProvider implements EmailProvider {
  constructor(private mb: Mailbox, private supabase: any) {}
  
  async ensureToken() {
    if (!isExpiring(this.mb.token_expires_at)) return
    
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        grant_type: 'refresh_token',
        refresh_token: this.mb.refresh_token || ''
      })
    })
    
    const j = await r.json()
    if (!j.access_token) throw new Error('gmail_refresh_failed')
    
    this.mb.access_token = j.access_token
    this.mb.token_expires_at = new Date(Date.now() + (j.expires_in || 3600)*1000).toISOString()
    
    await this.supabase.from('connected_accounts').update({
      access_token: this.mb.access_token, 
      token_expires_at: this.mb.token_expires_at
    }).eq('id', this.mb.id)
  }
  
  async send({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }): Promise<SendResult> {
    // RFC822 base64url
    const raw = btoa(
      `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${html}`
    ).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.mb.access_token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ raw })
    })
    
    if (r.status === 401) return { ok:false, code:'401' }
    if (r.status === 429) return { ok:false, code:'429' }
    if (r.status >= 500) return { ok:false, code:String(r.status) }
    
    const j = await r.json()
    return j.id ? { ok:true, id: j.id } : { ok:false, code: 'unknown' }
  }
}

