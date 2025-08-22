"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

export default function InvitePage() {
  const sb = createClientComponentClient()
  const [userId, setUserId] = useState<string>('')
  const [link, setLink] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [invited, setInvited] = useState<number>(0)
  const [upgraded, setUpgraded] = useState<number>(0)
  const [creditMonths, setCreditMonths] = useState<number>(0)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (user) setUserId(user.id)
      // Get link via API so it uses referral_code
      try {
        const resp = await fetch('/api/invite/link', { cache: 'no-store' })
        if (resp.ok) {
          const data = await resp.json()
          setLink(data.link)
        }
      } catch {}
      // Get status
      try {
        const resp = await fetch('/api/invite/status', { cache: 'no-store' })
        if (resp.ok) {
          const data = await resp.json()
          setInvited(data.invited || 0)
          setUpgraded(data.upgraded || 0)
          setCreditMonths(data.creditMonths || 0)
        }
      } catch {}
    }
    init()
  }, [])

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false), 1500) } catch {}
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Invite Friends</h1>
      <p className="text-sm text-gray-600 mb-4">Share your referral link. Get 1 month free when they upgrade.</p>
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-xs text-gray-600 mb-1">Your referral link</div>
        <div className="flex items-center gap-2">
          <input className="flex-1 border rounded p-2 text-sm" readOnly value={link} />
          <button onClick={copy} className="px-3 py-2 text-sm rounded bg-black text-white">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="text-xs text-gray-600 mt-2">You’ve invited {invited}. {upgraded} upgraded = {creditMonths} free month{creditMonths === 1 ? '' : 's'} earned.</div>
      </div>
    </div>
  )
}

