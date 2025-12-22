import { SendRequest, SendResult } from "../types"

export async function sendViaOutlook(req: SendRequest): Promise<SendResult> {
  // Call your existing Outlook-sender function
  const edgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!edgeUrl) throw new Error('Missing SUPABASE_URL')

  const res = await fetch(`${edgeUrl}/functions/v1/provider-send`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      provider: "outlook",
      from_email: req.fromEmail,
      to: req.toEmail,
      subject: req.subject,
      html: req.bodyHtml,
      text: req.bodyText,
      user_id: req.userId,
    }),
  })
  
  if (!res.ok) throw new Error(`Outlook send failed: ${await res.text()}`)
  const json = await res.json() as { id: string; conversationId: string }
  
  return { 
    provider: "outlook", 
    messageId: json.id, 
    threadId: json.conversationId 
  }
}
