import 'server-only'
import { createAdminClient } from '@/lib/supabase'

function generateRandomCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export async function ensureReferralCodeForUser(userId: string): Promise<string> {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle()
  if ((profile as any)?.referral_code) return (profile as any).referral_code as string

  // Attempt to set a unique code
  let attempts = 0
  while (attempts < 5) {
    attempts++
    const code = generateRandomCode(8)
    const { error } = await admin
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', userId)
    if (!error) return code
    // Unique constraint violation → retry
  }
  // Final fallback: include part of user id
  const fallback = `${generateRandomCode(5)}${userId.replace(/-/g, '').slice(0, 5).toUpperCase()}`
  await admin.from('profiles').update({ referral_code: fallback }).eq('id', userId)
  return fallback
}

