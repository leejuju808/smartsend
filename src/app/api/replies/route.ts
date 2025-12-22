import { NextRequest, NextResponse } from "next/server"

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

function headers() {
  return { apikey: ANON, Authorization: `Bearer ${SRV}` }
}

/**
 * Query params:
 *  - q: search across name/email/company/subject
 *  - status: sent|replied|any
 *  - hasNew: "1" to show only rows where has_new_reply = true
 *  - limit: default 25
 *  - cursor: ISO datetime for keyset (latest_inbound_at desc, fallback latest_outbound_at)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() || ""
  const status = url.searchParams.get("status") || "any"
  const hasNew = url.searchParams.get("hasNew") === "1"
  const limit = Math.min(Number(url.searchParams.get("limit") || 25), 100)
  const cursor = url.searchParams.get("cursor") // ISO string

  // Build PostgREST filter
  const params = new URLSearchParams()
  params.set(
    "select",
    "lead_id,email,first_name,last_name,company,status,latest_inbound_id,latest_inbound_at,latest_inbound_subject,latest_inbound_snippet,latest_thread_id,latest_outbound_at,has_new_reply"
  )
  params.set("order", "coalesce(latest_inbound_at,latest_outbound_at).desc,lead_id.asc")
  params.set("limit", String(limit + 1)) // fetch +1 for next cursor

  // Filters
  if (status !== "any") params.set("status", `eq.${status}`)
  if (hasNew) params.set("has_new_reply", "is.true")

  // Simple search (ILIKE OR chain)
  if (q) {
    // PostgREST or filter: and=(or(name.ilike.*q*,email.ilike.*q*))
    const like = `*${q.replace(/\s+/g, " *")}*`
    params.set(
      "or",
      [
        `email.ilike.${like}`,
        `first_name.ilike.${like}`,
        `last_name.ilike.${like}`,
        `company.ilike.${like}`,
        `latest_inbound_subject.ilike.${like}`,
        `latest_inbound_snippet.ilike.${like}`,
      ].join(",")
    )
  }

  // Keyset pagination: filter rows older than cursor timestamp
  if (cursor) {
    params.set("coalesce(latest_inbound_at,latest_outbound_at).lt", cursor)
  }

  const r = await fetch(`${SURL}/rest/v1/v_inbox_rows?${params.toString()}`, {
    headers: headers(),
    cache: "no-store",
  })
  if (!r.ok) {
    const msg = await r.text()
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  const rows = await r.json()

  let nextCursor: string | null = null
  let data = rows
  if (rows.length > limit) {
    const last = rows[limit - 1]
    nextCursor = last?.latest_inbound_at || last?.latest_outbound_at || null
    data = rows.slice(0, limit)
  }

  return NextResponse.json({ data, nextCursor })
}
