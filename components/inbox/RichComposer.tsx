'use client';

import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { mergeVars } from '@/lib/merge'
import { AttachFromFiles } from './AttachFromFiles'

type Lead = { 
  id: string; 
  email: string; 
  first_name?: string | null; 
  last_name?: string | null; 
  company?: string | null;
  do_not_contact?: boolean | null;
  email_status?: string | null;
  contact_id?: string | null; // Add contact_id for file sharing
}

type AttachmentPreview = {
  id: string;
  filename: string;
  contentId?: string;
  isInline: boolean;
}

export default function RichComposer({
  userId,
  campaignId,
  lead,
  onSent,
}: {
  userId: string
  campaignId?: string | null
  lead: Lead
  onSent?: () => void
}) {
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; body_html: string }>>([])
  const [selectedTpl, setSelectedTpl] = useState<string>('')
  const [signatureHtml, setSignatureHtml] = useState<string>('')
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([])
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Write your reply…' }),
    ],
    content: '<p></p>',
    autofocus: false,
    editorProps: { attributes: { class: 'min-h-28 prose prose-sm dark:prose-invert focus:outline-none' } },
  })

  // Load templates and signature
  useEffect(() => {
    async function load() {
      if (!userId) return
      const r = await fetch(`/api/email-templates?userId=${userId}`, { cache: 'no-store' })
      const d = await r.json()
      setTemplates(d.items || [])
      const s = await fetch(`/api/user-settings?userId=${userId}`, { cache: 'no-store' })
      const sj = await s.json()
      setSignatureHtml(sj?.item?.signature_html || '')
    }
    load()
  }, [userId])

  const vars = useMemo(() => ({
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company: lead.company || '',
    email: lead.email || '',
  }), [lead])

  async function applyTemplate(id: string) {
    if (!id || !editor) return
    const tpl = templates.find(t => t.id === id)
    if (!tpl) return
    setSubject(tpl.subject || '')
    const mergedBody = mergeVars(tpl.body_html || '', vars)
    const merged = signatureHtml ? `${mergedBody}<br/><br/>${signatureHtml}` : mergedBody
    editor.commands.setContent(merged)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('isInline', 'false')

      // TODO: Replace with actual auth headers
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: {
          'x-user-id': userId,
          'x-workspace-id': 'workspace-id', // TODO: Get from context
        },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setAttachments(prev => [...prev, {
        id: data.id,
        filename: data.filename,
        contentId: data.contentId,
        isInline: data.isInline,
      }])
    } catch (e: any) {
      alert(e.message || 'Failed to upload file')
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(att => att.id !== id))
  }

  async function handleAttachFromFiles(attachmentIds: string[]) {
    // Add selected files to attachments list
    // These are existing files from contact's library, so we just need their IDs
    const newAttachments = attachmentIds.map(id => ({
      id,
      filename: `File ${id.substring(0, 8)}...`, // Will be replaced with actual filename when sending
      contentId: undefined,
      isInline: false,
    }))
    setAttachments(prev => [...prev, ...newAttachments])
  }

  async function send() {
    if (!editor) return
    setSending(true)
    try {
      const body_html = editor.getHTML()
      const body_text = editor.getText()
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: undefined,
          to: lead.email,
          subject: subject || 'Re:',
          bodyText: body_text,
          bodyHtml: body_html,
          threadId_provider: undefined,
          replyToMessageId: undefined,
          attachmentIds: attachments.map(att => att.id),
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      editor.commands.clearContent()
      setSubject('')
      setAttachments([])
      onSent?.()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSending(false)
    }
  }

  function insertVar(token: string) {
    if (!editor) return
    editor.chain().focus().insertContent(`{{${token}}}`).run()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="w-full px-3 py-2 rounded-md border"
          placeholder="Subject"
          value={subject}
          onChange={(e)=>setSubject(e.target.value)}
        />
        <Select value={selectedTpl} onValueChange={(v)=>{ setSelectedTpl(v); applyTemplate(v); }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Templates" /></SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border p-2">
        <div className="flex flex-wrap gap-2 mb-2 text-sm">
          <button onClick={()=>editor?.chain().focus().toggleBold().run()} className="px-2 py-1 rounded border">B</button>
          <button onClick={()=>editor?.chain().focus().toggleItalic().run()} className="px-2 py-1 rounded border">I</button>
          <button onClick={()=>editor?.chain().focus().toggleBulletList().run()} className="px-2 py-1 rounded border">• List</button>
          <button onClick={()=>editor?.chain().focus().toggleOrderedList().run()} className="px-2 py-1 rounded border">1. List</button>
          <button onClick={()=>editor?.chain().focus().setLink({ href: 'https://', target: '_blank' }).run()} className="px-2 py-1 rounded border">Link</button>
          <div className="ml-auto flex gap-1">
            {['first_name','last_name','company','email'].map(v => (
              <button key={v} onClick={()=>insertVar(v)} className="text-xs px-2 py-1 rounded border bg-muted">{{`{{${v}}}`}}</button>
            ))}
          </div>
        </div>
        <EditorContent editor={editor as any} className="min-h-28" />
      </div>

      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded border">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 px-2 py-1 bg-white rounded border text-sm">
              <span className="text-gray-700">{att.filename}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-red-600 hover:text-red-800"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lead status badges */}
      {(lead.do_not_contact || lead.email_status === 'bounced') && (
        <div className="flex items-center gap-2 text-sm">
          {lead.do_not_contact && (
            <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 border border-orange-200">
              Do Not Contact
            </span>
          )}
          {lead.email_status === 'bounced' && (
            <span className="px-2 py-1 rounded bg-rose-100 text-rose-700 border border-rose-200">
              Email Bounced
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="file"
          id="file-upload"
          onChange={handleFileUpload}
          disabled={uploading || lead.do_not_contact || lead.email_status === 'bounced'}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.csv,.txt"
        />
        <label
          htmlFor="file-upload"
          className={`px-3 py-2 border rounded text-sm ${
            uploading || lead.do_not_contact || lead.email_status === 'bounced'
              ? 'cursor-not-allowed opacity-50' 
              : 'cursor-pointer hover:bg-gray-50'
          }`}
        >
          {uploading ? 'Uploading…' : '📎 Upload File'}
        </label>
        {lead.contact_id && (
          <AttachFromFiles
            contactId={lead.contact_id}
            onAttach={handleAttachFromFiles}
            disabled={lead.do_not_contact || lead.email_status === 'bounced'}
          />
        )}
        <Button 
          onClick={send} 
          disabled={sending || lead.do_not_contact || lead.email_status === 'bounced'}
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}


