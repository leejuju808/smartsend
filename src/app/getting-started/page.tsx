"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Mail, Upload, Play } from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabase'

type Progress = {
  connected_mailbox: boolean
  imported_leads: boolean
  launched_sequence: boolean
}

export default function GettingStartedPage() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('onboarding_progress')
        .select('connected_mailbox, imported_leads, launched_sequence')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!data) {
        // Seed a row for this user
        await supabase.from('onboarding_progress').insert({ user_id: user.id }).select().single()
        setProgress({ connected_mailbox: false, imported_leads: false, launched_sequence: false })
      } else {
        setProgress(data as any)
      }
      setLoading(false)
    }
    load()
  }, [])

  const steps = [
    {
      key: 'connected_mailbox',
      title: 'Connect your mailbox',
      desc: 'Use Gmail OAuth or SMTP to enable sending.',
      href: '/settings/mailbox',
      icon: <Mail className="h-5 w-5" />,
    },
    {
      key: 'imported_leads',
      title: 'Import your leads CSV',
      desc: 'Download the template and upload your leads.',
      href: '/leads/import',
      icon: <Upload className="h-5 w-5" />,
    },
    {
      key: 'launched_sequence',
      title: 'Launch a 3-step sequence',
      desc: 'Compose and start your first sequence.',
      href: '/sequences/new',
      icon: <Play className="h-5 w-5" />,
    },
  ] as const

  const allDone = progress && steps.every(s => (progress as any)[s.key])

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Getting Started</h1>
      <p className="text-sm text-gray-600 mb-6">Follow these steps to start sending campaigns.</p>

      <div className="space-y-4">
        {steps.map(step => {
          const done = progress ? (progress as any)[step.key] : false
          return (
            <div key={step.key} className="flex items-center justify-between rounded-lg border p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2 ${done ? 'bg-green-50' : 'bg-gray-50'}`}>{step.icon}</div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {step.title}
                    {done && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  </div>
                  <div className="text-sm text-gray-600">{step.desc}</div>
                </div>
              </div>
              <Link href={step.href} className="text-sm font-medium text-blue-600 hover:underline">Open</Link>
            </div>
          )
        })}
      </div>

      <div className="mt-6 text-sm flex items-center gap-4">
        <a href="/leads_template.csv" download className="text-blue-600 hover:underline">Download leads_template.csv</a>
        <button
          onClick={async ()=>{
            try {
              const res = await fetch('/api/demo/seed', { method: 'POST' })
              if (res.ok) {
                window.location.href = '/dashboard'
              } else {
                alert('Failed to load demo content')
              }
            } catch {
              alert('Failed to load demo content')
            }
          }}
          className="px-3 py-2 bg-black text-white rounded-md"
        >Try Demo</button>
      </div>

      {allDone && (
        <div className="mt-6 rounded-md bg-green-50 text-green-800 p-3 text-sm">All steps complete — you’re ready to go!</div>
      )}
    </div>
  )
}

