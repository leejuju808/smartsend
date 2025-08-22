'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { Clipboard, Check } from 'lucide-react'

export default function ReferralsPage() {
  const supabase = createClientComponentClient()
  const [user, setUser] = useState<any>(null)
  const [code, setCode] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState<{ invited: number; joined: number; converted: number }>({ invited: 0, joined: 0, converted: 0 })

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)
      const { data: profile } = await supabase.from('profiles').select('referral_code').eq('id', user.id).maybeSingle()
      setCode((profile as any)?.referral_code || '')
      const { data: rows } = await supabase
        .from('referrals')
        .select('status')
        .eq('inviter', user.id)
      const invited = rows?.length || 0
      const joined = rows?.filter(r => (r as any).status === 'joined').length || 0
      const converted = rows?.filter(r => (r as any).status === 'converted').length || 0
      setStats({ invited, joined, converted })
    })()
  }, [supabase])

  const inviteUrl = useMemo(() => {
    if (!code) return ''
    return `${window.location.origin}/signup?ref=${encodeURIComponent(code)}`
  }, [code])

  const copy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Referrals</h1>
        <p className="text-gray-600">Earn 1 free month for every friend who converts. They get 20% off.</p>
      </div>

      <div className="rounded-lg border p-4 bg-white">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-gray-500">Your referral link</div>
            <div className="font-mono text-sm truncate">{inviteUrl || 'Generating...'}</div>
          </div>
          <button onClick={copy} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Clipboard className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-gray-500">Invited</div>
          <div className="text-2xl font-semibold">{stats.invited}</div>
        </div>
        <div className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-gray-500">Joined</div>
          <div className="text-2xl font-semibold">{stats.joined}</div>
        </div>
        <div className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-gray-500">Converted</div>
          <div className="text-2xl font-semibold">{stats.converted}</div>
        </div>
      </div>
    </div>
  )
}

