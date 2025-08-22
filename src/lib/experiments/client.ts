'use client'

export function getOrSetAnonId(): string {
  if (typeof window === 'undefined') return 'anon'
  const k = 'anon_id'
  let v = localStorage.getItem(k)
  if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, v) }
  return v
}

export function pickVariant(experiment: string, variants = ['A','B'] as string[]): string {
  const key = `${getOrSetAnonId()}|${experiment}`
  // Simple deterministic hash (FNV-1a)
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  const idx = Math.abs(hash) % variants.length
  return variants[idx]
}

export async function trackClient(name: string, context: Record<string, any>) {
  try { await fetch('/api/analytics/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, context }) }) } catch {}
}

