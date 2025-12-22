export type Provider = "gmail" | "outlook"

export type SendRequest = {
  provider: Provider
  fromEmail: string
  toEmail: string
  subject: string
  bodyHtml?: string
  bodyText?: string
  leadId: string
  campaignId?: string | null
  userId: string                // owner (auth.uid)
}

export type SendResult = {
  provider: Provider
  messageId: string
  threadId: string              // Gmail threadId OR Outlook conversationId
}
