export type MailInput = {
  from: string
  to: string
  subject: string
  text?: string
  html?: string
}

export interface MailProvider {
  send(input: MailInput): Promise<{ id: string }>
}

export class MockProvider implements MailProvider {
  async send(input: MailInput) {
    // Pretend to send and return a fake id
    return { id: `mock_${Date.now()}` }
  }
}

// Build RFC822 raw string and base64url encode (no padding)
function buildRaw({ from, to, subject, text, html }: MailInput) {
  const boundary = "----=_SmartSend_" + Date.now()
  let body = ""
  if (html) {
    body =
`Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="UTF-8"

${text || ""}

--${boundary}
Content-Type: text/html; charset="UTF-8"

${html}

--${boundary}--`

  } else {
    body = `Content-Type: text/plain; charset="UTF-8"\n\n${text || ""}`
  }

  const raw =
`From: ${from}
To: ${to}
Subject: ${subject}
MIME-Version: 1.0
${html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : `Content-Type: text/plain; charset="UTF-8"`}

${html ? body : (text || "")}
`

  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"")
}

export class GmailProvider implements MailProvider {
  constructor(private userId: string) {}

  private async getTokens() {
    const supabase = (await import("@supabase/supabase-js")).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: acct, error } = await supabase
      .from("email_accounts")
      .select("access_token, refresh_token, expires_at, email")
      .eq("user_id", this.userId).eq("provider", "gmail").single()
    if (error || !acct) throw new Error("No Gmail account connected")
    return acct
  }

  private async ensureAccessToken() {
    const supabase = (await import("@supabase/supabase-js")).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const acct = await this.getTokens()
    const soon = new Date(acct.expires_at || 0).getTime() - 60_000
    if (Date.now() < soon) return { access_token: acct.access_token, email: acct.email }

    if (!acct.refresh_token) throw new Error("Missing refresh_token; re-connect Gmail")
    const { refreshAccessToken } = await import("@/lib/google/oauth")
    const refreshed = await refreshAccessToken(acct.refresh_token)
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    const { error } = await supabase.from("email_accounts").update({
      access_token: refreshed.access_token, expires_at: expiresAt
    }).eq("user_id", this.userId).eq("provider", "gmail")
    if (error) throw error
    return { access_token: refreshed.access_token, email: acct.email }
  }

  async send(input: MailInput) {
    const { access_token, email } = await this.ensureAccessToken()
    const raw = buildRaw({ ...input, from: input.from || email })

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    })
    if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`)
    const j = await res.json() as { id: string }
    return { id: j.id }
  }
}

export class OutlookProvider implements MailProvider {
  constructor(private accessToken: string) {}

  async send(input: MailInput): Promise<{ id: string }> {
    // Use Microsoft Graph /sendMail
    throw new Error("OutlookProvider not wired yet")
  }
}

export function getProvider(provider: 'gmail'|'outlook'|'mock', opts?: { userId: string, accessToken?: string }): MailProvider {
  if (provider === 'gmail' && opts?.userId) return new GmailProvider(opts.userId)
  if (provider === 'outlook' && opts?.accessToken) return new OutlookProvider(opts.accessToken)
  return new MockProvider()
}
