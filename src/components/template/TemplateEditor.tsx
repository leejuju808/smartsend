'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { 
  Save, 
  MessageSquare, 
  Users, 
  Eye, 
  EyeOff,
  Copy,
  CheckCircle,
  Send
} from 'lucide-react'
import { EmailTemplate } from '@/types/database'
import TemplateComments from './TemplateComments'

interface TemplateEditorProps {
  templateId: string
  workspaceId: string
  onSave?: (template: EmailTemplate) => void
}

export default function TemplateEditor({ templateId, workspaceId, onSave }: TemplateEditorProps) {
  const [template, setTemplate] = useState<EmailTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showComments, setShowComments] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadTemplate()
  }, [templateId])

  const loadTemplate = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single()

      if (error) {
        console.error('Error loading template:', error)
      } else {
        setTemplate(data)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!template) return

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .update({
          target_audience: template.target_audience,
          product_service: template.product_service,
          tone: template.tone,
          generated_emails: template.generated_emails,
          optimized_version: template.optimized_version,
          performance_notes: template.performance_notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId)
        .select()
        .single()

      if (error) {
        console.error('Error saving template:', error)
      } else {
        setTemplate(data)
        onSave?.(data)
        
        // Log team activity
        await supabase.rpc('log_team_activity', {
          p_workspace_id: workspaceId,
          p_action: 'edited_template',
          p_entity_type: 'template',
          p_entity_id: templateId
        })
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(field)
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
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="text-center text-gray-500 py-12">
        <p>Template not found</p>
      </div>
    )
  }

  const emails = parseEmails(template.generated_emails)

  return (
    <div className="flex h-full">
      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-medium text-gray-900">Template Editor</h2>
            <button
              onClick={() => setShowComments(!showComments)}
              className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                showComments 
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showComments ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {showComments ? 'Hide' : 'Show'} Comments
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* Template Metadata */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Audience
              </label>
              <input
                type="text"
                value={template.target_audience}
                onChange={(e) => setTemplate({ ...template, target_audience: e.target.value })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product/Service
              </label>
              <input
                type="text"
                value={template.product_service}
                onChange={(e) => setTemplate({ ...template, product_service: e.target.value })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tone
              </label>
              <select
                value={template.tone}
                onChange={(e) => setTemplate({ ...template, tone: e.target.value as any })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
              </select>
            </div>
          </div>
        </div>

        {/* Email Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {emails.map((email, index) => (
              <div key={email.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Email {index + 1}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyToClipboard(email.subject, `subject-${index}`)}
                      className="inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                    >
                      {copied === `subject-${index}` ? (
                        <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      Copy Subject
                    </button>
                    <button
                      onClick={() => copyToClipboard(email.body, `body-${index}`)}
                      className="inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                    >
                      {copied === `body-${index}` ? (
                        <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      Copy Body
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject Line
                    </label>
                    <input
                      type="text"
                      value={email.subject}
                      onChange={(e) => {
                        const newEmails = [...emails]
                        newEmails[index].subject = e.target.value
                        const newEmailsText = newEmails.map((email, i) => 
                          `${i + 1}. Subject: ${email.subject}\n${email.body}`
                        ).join('\n\n')
                        setTemplate({ ...template, generated_emails: newEmailsText })
                      }}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Body
                    </label>
                    <textarea
                      rows={8}
                      value={email.body}
                      onChange={(e) => {
                        const newEmails = [...emails]
                        newEmails[index].body = e.target.value
                        const newEmailsText = newEmails.map((email, i) => 
                          `${i + 1}. Subject: ${email.subject}\n${email.body}`
                        ).join('\n\n')
                        setTemplate({ ...template, generated_emails: newEmailsText })
                      }}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comments Sidebar */}
      {showComments && (
        <TemplateComments 
          templateId={templateId} 
          workspaceId={workspaceId} 
        />
      )}
    </div>
  )
} 