import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const cc = url.searchParams.get('cc') || undefined
  const target = url.searchParams.get('url') || ''
  const safe = /^https?:\/\//i.test(target)

  try {
    if (cc && safe) {
      const sb = createAdminClient()
      await sb.from('email_clicks').insert({ campaign_contact_id: cc, url: target })
    }
  } catch {}

  return Response.redirect(safe ? target : (process.env.NEXT_PUBLIC_SITE_URL || 'https://smartsend.ai'), 302)
}

