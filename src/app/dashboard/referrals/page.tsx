'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { Clipboard, Check, Gift } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface ReferralRecord {
  id: string
  referred_email: string
  status: string
  reward_amount: number
  created_at: string
  converted_at?: string
  credited_at?: string
}

export default function ReferralsPage() {
  const supabase = createClientComponentClient()
  const [user, setUser] = useState<any>(null)
  const [code, setCode] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState<{ invited: number; joined: number; converted: number }>({ invited: 0, joined: 0, converted: 0 })
  const [credits, setCredits] = useState<number>(0)
  const [referrals, setReferrals] = useState<ReferralRecord[]>([])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)
      const { data: profile } = await supabase.from('profiles').select('referral_code, referral_credits').eq('id', user.id).maybeSingle()
      setCode((profile as any)?.referral_code || '')
      setCredits((profile as any)?.referral_credits || 0)
      
      // Fetch stats from referral_stats view or fallback to counting
      const { data: statsData } = await supabase
        .from('v_referral_stats')
        .select('*')
        .eq('referrer_id', user.id)
        .maybeSingle()
      
      if (statsData) {
        setStats({
          invited: statsData.pending_count || 0,
          joined: statsData.activated_count || 0,
          converted: statsData.rewarded_count || 0
        })
      } else {
        // Fallback: count from referrals table
        const { data: rows } = await supabase
          .from('referrals')
          .select('status')
          .eq('referrer_id', user.id)
        const invited = rows?.length || 0
        const joined = rows?.filter(r => r.status === 'activated').length || 0
        const converted = rows?.filter(r => r.status === 'rewarded').length || 0
        setStats({ invited, joined, converted })
      }
      
      // Fetch recent referrals for ledger
      const { data: refs } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setReferrals(refs as ReferralRecord[] || [])
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Referrals</h1>
        <p className="text-gray-600">Earn credits for every friend who joins. They get 20% off.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-green-600" />
            <CardTitle>Your Credits Balance</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600">{credits.toFixed(2)}</div>
          <p className="text-sm text-muted-foreground mt-1">
            Credits earned from successful referrals
          </p>
        </CardContent>
      </Card>

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
        <Card className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-2xl font-semibold">{stats.invited}</div>
        </Card>
        <Card className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-gray-500">Activated</div>
          <div className="text-2xl font-semibold">{stats.joined}</div>
        </Card>
        <Card className="rounded-lg border p-4 bg-white">
          <div className="text-sm text-gray-500">Rewarded</div>
          <div className="text-2xl font-semibold">{stats.converted}</div>
        </Card>
      </div>

      {referrals.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Credits Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{ref.referred_email}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ref.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${
                      ref.status === 'rewarded' ? 'text-green-600' : 
                      ref.status === 'activated' ? 'text-blue-600' : 
                      'text-gray-500'
                    }`}>
                      {ref.status}
                    </div>
                    {ref.reward_amount > 0 && (
                      <div className="text-xs text-green-600">
                        +{ref.reward_amount.toFixed(2)} credits
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

