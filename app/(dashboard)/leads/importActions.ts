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
    const mapped = part.map(r => ({
      workspace_id,
      email: r.email.trim().toLowerCase(),
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      company: r.company ?? null,
      phone: r.phone ?? null,
      meta: r.meta ?? {},
    }))

    const query = supabase.from('leads')
    const upsert = overwrite
      ? query.upsert(mapped, { onConflict: 'email' })
      : query.insert(mapped, { ignoreDuplicates: true })

    const { error, count } = await upsert.select('id', { count: 'exact' })
    if (error) {
      errors.push(error.message)
    } else {
      if (overwrite) inserted += count ?? 0
      else inserted += count ?? 0
      // approx skipped when not overwriting = attempted in part - inserted
      if (!overwrite) skipped += mapped.length - (count ?? 0)
    }
  }

  return { attempted, inserted, skipped, errors }
}
