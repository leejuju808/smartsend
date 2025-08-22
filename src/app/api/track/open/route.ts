import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'edge'

function pixel() {
  const base64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' // 1x1 gif
  return Buffer.from(base64, 'base64')
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const cc = url.searchParams.get('cc') || undefined
  const messageId = url.searchParams.get('mid') || undefined
  const userId = url.searchParams.get('uid') || undefined
  try {
    const sb = createAdminClient()
    if (cc) {
      await sb.from('email_opens').insert({ campaign_contact_id: cc })
    } else if (userId && messageId) {
      await sb.from('analytics_events').insert({ name: 'email_opened', user_id: userId, context: { messageId } })
    }
  } catch {}
  return new Response(pixel(), {
    status: 200,
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    },
  })
}

