'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/Textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type Props = {
  composerValue: string
  setComposerValue: (v: string) => void
  defaultVars: { first_name?: string; company?: string; position?: string; last_email_summary?: string }
  templateBody?: string
  threadId?: string | null
}

type Template = {
  id: string
  name: string
  body: string
  created_at: string
}

export default function Rewriter({ composerValue, setComposerValue, defaultVars, templateBody: initialTemplateBody, threadId }: Props) {
  const [tone, setTone] = useState<'friendly'|'professional'|'casual'|'bold'|'concise'>('professional')
  const [length, setLength] = useState<'short'|'medium'|'long'>('short')
  const [cta, setCta] = useState<'book_call'|'reply_yes'|'share_availability'|'custom'>('reply_yes')
  const [audience, setAudience] = useState<'founder'|'marketing'|'sales'|'ops'|'it'|'general'>('general')
  const [vars, setVars] = useState(defaultVars)
  const [customCta, setCustomCta] = useState('')
  const [variants, setVariants] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState<string | undefined>()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateBody, setTemplateBody] = useState<string>(initialTemplateBody || '')

  // Load templates on mount
  useEffect(() => {
    fetch('/api/templates/list')
      .then(res => res.json())
      .then(data => {
        if (data.templates) {
          setTemplates(data.templates)
        }
      })
      .catch(err => console.error('Failed to load templates:', err))
  }, [])

  // Update templateBody when template is selected
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId)
      if (template) {
        setTemplateBody(template.body)
      }
    } else {
      setTemplateBody(initialTemplateBody || '')
    }
  }, [selectedTemplateId, templates, initialTemplateBody])

  const onRewrite = async () => {
    setLoading(true)
    setVariants([])
    setWarning(undefined)
    
    try {
      const url = new URL('/api/ai/rewrite', window.location.origin)
      if (threadId) {
        url.searchParams.set('threadId', threadId)
      }

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseText: composerValue,
          templateBody,
          variables: vars,
          tone, 
          length, 
          cta, 
          customCta, 
          audience
        })
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error?.error || 'Failed to rewrite')
        return
      }

      const j = await res.json()
      setVariants(j.variants || [])
      if (j.warning) {
        setWarning(j.warning)
      }
    } catch (error) {
      console.error('Error rewriting:', error)
      alert('Failed to rewrite')
    } finally {
      setLoading(false)
    }
  }

  const getCharCount = (text: string) => text.length

  return (
    <div className="flex flex-col gap-3">
      {/* Template Selector */}
      {templates.length > 0 && (
        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a saved template (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None (use composer text)</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select value={tone} onValueChange={(v: any) => setTone(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
            <SelectItem value="concise">Concise</SelectItem>
          </SelectContent>
        </Select>

        <Select value={length} onValueChange={(v: any) => setLength(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Length" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="long">Long</SelectItem>
          </SelectContent>
        </Select>

        <Select value={cta} onValueChange={(v: any) => setCta(v)}>
          <SelectTrigger>
            <SelectValue placeholder="CTA" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reply_yes">Reply "yes"</SelectItem>
            <SelectItem value="share_availability">Share availability</SelectItem>
            <SelectItem value="book_call">Book a call</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="founder">Founder</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="ops">Operations</SelectItem>
            <SelectItem value="it">IT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cta === 'custom' && (
        <Input 
          placeholder="Custom CTA" 
          value={customCta} 
          onChange={(e) => setCustomCta(e.target.value)} 
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input 
          placeholder="First name" 
          value={vars.first_name ?? ''} 
          onChange={(e) => setVars(v => ({ ...v, first_name: e.target.value }))} 
        />
        <Input 
          placeholder="Company" 
          value={vars.company ?? ''} 
          onChange={(e) => setVars(v => ({ ...v, company: e.target.value }))} 
        />
        <Input 
          placeholder="Position/Role" 
          value={vars.position ?? ''} 
          onChange={(e) => setVars(v => ({ ...v, position: e.target.value }))} 
        />
        <Input 
          placeholder="Last email summary" 
          value={vars.last_email_summary ?? ''} 
          onChange={(e) => setVars(v => ({ ...v, last_email_summary: e.target.value }))} 
        />
      </div>

      <Button onClick={onRewrite} disabled={loading}>
        {loading ? 'Thinking…' : 'Rewrite (3 variants)'}
      </Button>

      {warning && (
        <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
          {warning}
        </div>
      )}

      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div key={i} className="rounded-2xl border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs opacity-60">Variant {i+1}</div>
                <div className="text-xs opacity-60">
                  {getCharCount(v)} chars {getCharCount(v) > 1400 && '⚠️'}
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm mb-2">{v}</div>
              <div className="mt-2 flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setComposerValue(v)}
                >
                  Insert
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setComposerValue(prev => (prev ? prev + '\n\n' + v : v))}
                >
                  Append
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

