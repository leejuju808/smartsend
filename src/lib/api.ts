// Client helpers for inbox/replies API

export async function fetchReplies({
  q = "",
  status = "any",
  hasNew = false,
  cursor = "",
  limit = 25,
}: {
  q?: string
  status?: string
  hasNew?: boolean
  cursor?: string
  limit?: number
}) {
  const u = new URL("/api/replies", window.location.origin)
  if (q) u.searchParams.set("q", q)
  if (status !== "any") u.searchParams.set("status", status)
  if (hasNew) u.searchParams.set("hasNew", "1")
  if (cursor) u.searchParams.set("cursor", cursor)
  u.searchParams.set("limit", String(limit))
  const r = await fetch(u.toString(), { cache: "no-store" })
  if (!r.ok) throw new Error("Failed to load replies")
  return r.json() as Promise<{ data: any[]; nextCursor: string | null }>
}

export async function fetchThread(leadId: string) {
  const r = await fetch(`/api/threads/${leadId}`, { cache: "no-store" })
  if (!r.ok) throw new Error("Failed to load thread")
  return r.json() as Promise<{ lead: any; messages: any[] }>
}

