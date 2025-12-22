import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { google } from "https://esm.sh/googleapis@127"

type Body = { user_id: string; message_id: string }

function decodeBody(data?: string) {
  if (!data) return ""
  // Gmail returns URL-safe base64
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  try { return atob(b64) } catch { return "" }
}

function extractParts(payload: any): { mimeType: string; content: string }[] {
  const parts: { mimeType: string; content: string }[] = []
  if (!payload) return parts

  const walk = (p: any) => {
    if (!p) return
    if (p.body?.data && p.mimeType) {
      parts.push({ mimeType: p.mimeType, content: decodeBody(p.body.data) })
    }
    if (p.parts && Array.isArray(p.parts)) p.parts.forEach(walk)
  }
  walk(payload)
  return parts
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
  try {
    const { user_id, message_id } = (await req.json()) as Body
    if (!user_id || !message_id) return new Response("Missing params", { status: 400 })

    // Get Gmail integration tokens from user_connections
    const { data: integration, error: intErr } = await supabase
      .from("user_connections")
      .select("access_token, refresh_token")
      .eq("user_id", user_id)
      .eq("provider", "gmail")
      .maybeSingle()
    
    if (intErr || !integration) {
      return new Response("No Gmail integration", { status: 404 })
    }

    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
    })
    const gmail = google.gmail({ version: "v1", auth: oauth2Client })

    // 1) Get the message to find its threadId
    const msg = await gmail.users.messages.get({ userId: "me", id: message_id, format: "full" })
    const threadId = msg.data.threadId
    if (!threadId) return new Response("No thread found", { status: 404 })

    // 2) Get entire thread
    const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" })
    const items = (thread.data.messages || []).map((m) => {
      const headers = m.payload?.headers || []
      const get = (n: string) => headers.find((h: any) => h.name?.toLowerCase() === n.toLowerCase())?.value || ""
      const parts = extractParts(m.payload)
      const text = parts.find(p => p.mimeType === "text/plain")?.content || ""
      const html = parts.find(p => p.mimeType === "text/html")?.content || ""
      return {
        id: m.id,
        internalDate: m.internalDate,
        from: get("From"),
        to: get("To"),
        subject: get("Subject"),
        date: get("Date"),
        snippet: m.snippet || "",
        text,
        html,
      }
    })

    return new Response(JSON.stringify({ threadId, messages: items }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 })
  }
})

