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
  Rocket
} from 'lucide-react'
import { generateColdEmails, EmailGenerationParams } from '@/lib/openai'
import { createClientComponentClient } from '@/lib/supabase'
import Link from 'next/link'
import { getUserWithSubscription } from '@/lib/getUserWithSubscription'

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
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoStats, setDemoStats] = useState<{ sent: number; opened: number; replied: number } | null>(null)
  const [seeding, setSeeding] = useState(false)
  
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
      const { data } = await supabase
        .from('users')
        .select('subscription_status')
        .eq('id', user.id)
        .maybeSingle()
      setIsPro(data?.subscription_status === 'pro' || data?.subscription_status === 'active')
    }
    check()
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

  const launchDemoCampaign = async () => {
    try {
      setSeeding(true)
      const res = await fetch('/api/demo/seed', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to seed demo campaign')
      const j = await res.json().catch(() => ({}))
      alert(`Demo campaign ready: ${j.leads || 0} leads, ${j.sends || 0} sends, opens ${j.opens || 0}, replies ${j.replies || 0}`)
    } catch (e) {
      alert('Unable to launch demo campaign. Please try again.')
    } finally {
      setSeeding(false)
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
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Demo campaign launcher */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-600">New here?</div>
          <div className="text-base font-medium text-gray-900">Launch Demo Campaign to see metrics instantly</div>
        </div>
        <button
          disabled={demoLoading}
          onClick={async () => {
            try {
              setDemoLoading(true)
              const res = await fetch('/api/demo/launch', { method: 'POST' })
              const j = await res.json()
              if (j?.ok) {
                setDemoStats({ sent: j.sent, opened: j.opened, replied: j.replied })
                alert(`Demo campaign seeded: ${j.sent} sent, ${j.opened} opened, ${j.replied} replied`)
              } else {
                alert('Failed to seed demo campaign')
              }
            } catch (e) {
              alert('Failed to seed demo campaign')
            } finally {
              setDemoLoading(false)
            }
          }}
          className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
        >
          {demoLoading ? (
            <>
              <Loader2 className="animate-spin h-4 w-4 mr-2" />
              Seeding...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4 mr-2" />
              Launch Demo Campaign
            </>
          )}
        </button>
      </div>

      {demoStats && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Demo metrics</div>
          <div className="text-sm">Sent: {demoStats.sent} · Opened: {demoStats.opened} · Replied: {demoStats.replied}</div>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Generate Cold Emails</h1>
        <p className="mt-2 text-gray-600">
          Create compelling cold emails tailored to your target audience
        </p>
        <div className="mt-4">
          <button
            onClick={launchDemoCampaign}
            disabled={seeding}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md text-sm"
          >
            {seeding ? 'Launching Demo…' : 'Launch Demo Campaign'}
          </button>
        </div>
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
  )
} 