'use client'

import { useState, useEffect } from 'react'
import { 
  History, 
  Copy, 
  Trash2, 
  Calendar,
  Target,
  Package,
  MessageSquare,
  CheckCircle
} from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface EmailTemplate {
  id: string
  target_audience: string
  product_service: string
  tone: string
  generated_emails: string
  created_at: string
}

export default function HistoryPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching templates:', error)
      } else {
        setTemplates(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting template:', error)
      } else {
        setTemplates(templates.filter(t => t.id !== id))
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const copyToClipboard = async (text: string, templateId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(templateId)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const parseEmails = (emailsText: string) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Email History</h1>
        <p className="mt-2 text-gray-600">
          View and manage your previously generated cold emails
        </p>
      </div>

      {/* Templates */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No emails generated yet</h3>
          <p className="text-gray-600 mb-6">
            Start by generating your first cold email to see it here.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Generate Email
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {templates.map((template) => (
            <div key={template.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {/* Template Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(new Date(template.created_at))}
                    </div>
                    <div className="flex items-center">
                      <Target className="h-4 w-4 mr-1" />
                      {template.target_audience}
                    </div>
                    <div className="flex items-center">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      {template.tone}
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Package className="h-4 w-4 mr-1" />
                    {template.product_service}
                  </div>
                </div>
                <button
                  onClick={() => deleteTemplate(template.id)}
                  className="text-red-600 hover:text-red-800 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Generated Emails */}
              <div className="space-y-4">
                {parseEmails(template.generated_emails).map((email) => (
                  <div key={email.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">{email.subject}</h4>
                      <button
                        onClick={() => copyToClipboard(email.fullText, `${template.id}-${email.id}`)}
                        className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                      >
                        {copied === `${template.id}-${email.id}` ? (
                          <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 mr-1" />
                        )}
                        {copied === `${template.id}-${email.id}` ? 'Copied!' : 'Copy'}
                      </button>
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
          ))}
        </div>
      )}
    </div>
  )
} 