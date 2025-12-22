'use server'

import { createSupabaseServer } from '@/lib/supabaseServer'
import { z } from 'zod'

const Row = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  meta: z.record(z.any()).optional(),
})

const Payload = z.object({
  workspace_id: z.string().uuid(),
  rows: z.array(Row),
  overwrite: z.boolean().default(false),
})

export async function importLeadsAction(input: unknown) {
  const { workspace_id, rows, overwrite } = Payload.parse(input)
  const supabase = createSupabaseServer()

  const chunk = <T,>(arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    )

  let attempted = rows.length
  let inserted = 0
  let skipped = 0
  let errors: string[] = []

  for (const part of chunk(rows, 500)) {
    const mapped = part.map((r: z.infer<typeof Row>) => ({
      workspace_id,
      email: r.email.trim().toLowerCase(),
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      company: r.company ?? null,
      phone: r.phone ?? null,
      meta: r.meta ?? {},
    }))

    const { error, count } = overwrite
      ? await supabase.from('leads').upsert(mapped, { 
          onConflict: 'workspace_id,email'
        }).select('id', { count: 'exact' })
      : await supabase.from('leads').insert(mapped).select('id', { count: 'exact' })
    
    if (error) {
      errors.push(error.message)
      skipped += part.length // Treat errors as skipped
    } else {
      const actualCount = count ?? 0
      inserted += actualCount
      // Approximate skipped when not overwriting = attempted in part - inserted
      if (!overwrite) {
        skipped += mapped.length - actualCount
      }
    }
  }

  // Mark onboarding step complete if leads were imported
  if (inserted > 0) {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'import_leads' }),
      })
    } catch (e) {
      // Silently fail - onboarding is not critical
      console.error('Failed to mark onboarding step complete:', e)
    }
  }

  return { attempted, inserted, skipped, errors }
}
