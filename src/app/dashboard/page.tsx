"use client"
import { useEffect, useState } from 'react'
import { 
  Zap, 
  Copy, 
  Save, 
  Loader2, 
  CheckCircle,
  Target,
  Package,
  MessageSquare,
  Rocket,
  MailOpen,
  Reply,
  SendHorizonal
} from 'lucide-react'
import { generateColdEmails, EmailGenerationParams } from '@/lib/openai'
import { createClientComponentClient } from '@/lib/supabase'
import Link from 'next/link'
import { getUserWithSubscription } from '@/lib/getUserWithSubscription'
import DailySendsCard from './components/DailySendsCard'
import DemoSeedButton from './components/DemoSeedButton'
import DashboardMetrics from './components/DashboardMetrics'
import MonthlyUsageMeter from '@/components/MonthlyUsageMeter'
import ContactsImporter from '@/components/ContactsImporter'
import SuppressionManager from '@/components/SuppressionManager'
import { UpgradeToast } from '@/components/UpgradeToast'

export default function DashboardPage() {
  const [formData, setFormData] = useState({
    targetAudience: '',
    productService: '',
    tone: 'professional' as const
  })
  const [generatedEmails, setGeneratedEmails] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoMessage, setDemoMessage] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<{ sent: number; opened: number; replied: number } | null>(null)
  const [demoDone, setDemoDone] = useState(false)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsAuthed(false)
        setIsPro(false)
        return
      }
      setIsAuthed(true)
      setAuthUserId(user.id)
      const { data } = await supabase
        .from('users')
        .select('subscription_status')
        .eq('id', user.id)
        .maybeSingle()
      setIsPro(data?.subscription_status === 'pro' || data?.subscription_status === 'active')
    }
    check()
    ;(async () => {
      try {
        const res = await fetch('/api/analytics/summary', { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          setMetrics({ sent: j.sent || 0, opened: j.opened || 0, replied: j.replied || 0 })
        }
      } catch {}
    })()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setGeneratedEmails('')

    try {
      const emails = await generateColdEmails(formData)
      setGeneratedEmails(emails)
      
      // Save to database
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('email_templates').insert({
          user_id: user.id,
          target_audience: formData.targetAudience,
          product_service: formData.productService,
          tone: formData.tone,
          generated_emails: emails
        })
      }
    } catch (error) {
      console.error('Error generating emails:', error)
      alert('Failed to generate emails. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, emailId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(emailId)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const saveEmail = async (emailContent: string, emailId: string) => {
    try {
      // Here you could save to a favorites list or mark as saved
      setSaved(emailId)
      setTimeout(() => setSaved(null), 2000)
    } catch (error) {
      console.error('Failed to save:', error)
    }
  }

  const parseEmails = (emailsText: string) => {
    // Simple parsing - in a real app you'd want more robust parsing
    const emailBlocks = emailsText.split(/\d+\./).filter(block => block.trim())
    return emailBlocks.map((block, index) => {
      const lines = block.trim().split('\n')
      const subjectLine = lines.find(line => line.toLowerCase().includes('subject:'))
      const body = lines.filter(line => !line.toLowerCase().includes('subject:')).join('\n')
      
      return {
        id: `email-${index}`,
        subject: subjectLine?.replace(/subject:\s*/i, '') || 'Cold Email',
        body: body.trim(),
        fullText: block.trim()
      }
    })
  }

  const handleLaunchDemo = async () => {
    setDemoMessage(null)
    setDemoLoading(true)
    try {
      const res = await fetch('/api/demo/seed', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to seed demo')
      const j = await res.json()
      setDemoMessage(`Demo ready: ${j.leads} leads, ${j.sends} sends queued.`)
      // Refresh metrics
      try {
        const r2 = await fetch('/api/analytics/summary', { cache: 'no-store' })
        const j2 = await r2.json()
        setMetrics({ sent: j2.sent || 0, opened: j2.opened || 0, replied: j2.replied || 0 })
      } catch {}
    } catch (e) {
      setDemoMessage('Could not launch demo campaign. Please try again.')
    } finally {
      setDemoLoading(false)
    }
  }

  if (isAuthed === false) {
    return (
      <div className="p-6">
        Please <Link href="/login" className="text-blue-600 underline">sign in</Link> to use the dashboard.
      </div>
    )
  }

  if (isPro === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Upgrade required</h1>
        <p className="mb-4">You’re on the free plan. <Link href="/dashboard/billing" className="text-blue-600 underline">Upgrade to Pro</Link> to unlock all features.</p>
        <div className="mt-6 border rounded-lg p-4 bg-white max-w-xl">
          <div className="font-medium mb-2">Or, see SmartSend in action</div>
          <p className="text-sm text-gray-600 mb-3">Launch a demo campaign that seeds a few leads and instant results.</p>
          {authUserId ? (
            <DemoSeedButton
              userId={authUserId}
              onDone={(m) => {
                setDemoDone(true)
                setMetrics({ sent: m.sent, opened: m.open, replied: m.reply })
              }}
            />
          ) : null}
          {demoMessage && <div className="mt-3 text-sm text-gray-800">{demoMessage}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UpgradeToast />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <MonthlyUsageMeter />
        {authUserId ? (
          <DailySendsCard userId={authUserId} />
        ) : null}
        {/* Metrics */}
        {authUserId ? (
          <DashboardMetrics userId={authUserId} onZeroState={() => {}} />
        ) : null}
        <div className="border rounded-lg p-4 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Instant Demo</div>
              <div className="text-sm text-gray-600">Seed a demo campaign to see metrics immediately.</div>
            </div>
            {authUserId ? (
              <DemoSeedButton
                userId={authUserId}
                onDone={(m) => {
                  setDemoDone(true)
                  setMetrics({ sent: m.sent, opened: m.open, replied: m.reply })
                }}
              />
            ) : null}
          </div>
          {demoMessage && <div className="mt-3 text-sm text-gray-800">{demoMessage}</div>}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <ContactsImporter />
          <SuppressionManager />
        </div>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Generate Cold Emails</h1>
          <p className="mt-2 text-gray-600">Create compelling cold emails tailored to your target audience</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="targetAudience" className="block text-sm font-medium text-gray-700 mb-2">
                  <Target className="inline h-4 w-4 mr-1" />
                  Target Audience
                </label>
                <input
                  type="text"
                  id="targetAudience"
                  value={formData.targetAudience}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                  placeholder="e.g., SaaS founders, marketing managers, tech startups"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="productService" className="block text-sm font-medium text-gray-700 mb-2">
                  <Package className="inline h-4 w-4 mr-1" />
                  Product/Service
                </label>
                <input
                  type="text"
                  id="productService"
                  value={formData.productService}
                  onChange={(e) => setFormData({ ...formData, productService: e.target.value })}
                  placeholder="e.g., AI-powered email automation tool"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="tone" className="block text-sm font-medium text-gray-700 mb-2">
                <MessageSquare className="inline h-4 w-4 mr-1" />
                Tone
              </label>
              <select
                id="tone"
                value={formData.tone}
                onChange={(e) => setFormData({ ...formData, tone: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-md flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Generating emails...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5 mr-2" />
                  Generate Cold Emails
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        {generatedEmails && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Generated Emails</h2>
            <div className="space-y-6">
              {parseEmails(generatedEmails).map((email) => (
                <div key={email.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900">{email.subject}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => copyToClipboard(email.fullText, email.id)}
                        className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                      >
                        {copied === email.id ? (
                          <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 mr-1" />
                        )}
                        {copied === email.id ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        onClick={() => saveEmail(email.fullText, email.id)}
                        className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                      >
                        {saved === email.id ? (
                          <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                        ) : (
                          <Save className="h-4 w-4 mr-1" />
                        )}
                        {saved === email.id ? 'Saved!' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                      {email.body}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 