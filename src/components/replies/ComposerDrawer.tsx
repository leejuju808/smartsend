"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { listConnections, sendReply, type EmailConnection } from "@/lib/replies/composer";
import { createClientComponentClient } from "@/lib/supabase";
import DOMPurify from "dompurify";
import { RewriterBar } from "@/components/composer/RewriterBar";

interface ComposerDrawerProps {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  toEmail: string;
  subjectPrefill: string;
  lastMsgHtml: string | null;
  initialHtml?: string;
  initialSubject?: string;
  onPrefillConsumed?: () => void;
  campaignId?: string | null;
}

export default function ComposerDrawer({
  open,
  onClose,
  threadId,
  toEmail,
  subjectPrefill,
  lastMsgHtml,
  initialHtml,
  initialSubject,
  onPrefillConsumed,
  campaignId,
}: ComposerDrawerProps) {
  const [conns, setConns] = useState<EmailConnection[]>([]);
  const [connId, setConnId] = useState<string>('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [includeQuote, setIncludeQuote] = useState(false);
  const [sending, setSending] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClientComponentClient();
  const editorRef = useRef<HTMLDivElement | null>(null);

  const CAL_LINK = process.env.NEXT_PUBLIC_CAL_LINK ?? "https://cal.com/you/intro";
  const PRICING_URL = process.env.NEXT_PUBLIC_PRICING_URL ?? "https://smartsendhq.com/pricing";

  // Get org_id
  useEffect(() => {
    const getOrgId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .single();
        
        if (profile?.org_id) {
          setOrgId(profile.org_id);
        }
      }
    };
    if (open) {
      getOrgId();
    }
  }, [open, supabase]);

  // Load connections when drawer opens
  useEffect(() => {
    if (open) {
      listConnections()
        .then(setConns)
        .catch(console.error);
    }
  }, [open]);

  // Set default connection
  useEffect(() => {
    if (conns.length && !connId) {
      setConnId(conns[0].id);
    }
  }, [conns, connId]);

  // Prefill To and Subject
  useEffect(() => {
    if (!open) return;
    setTo(toEmail || '');
    const nextSubject = initialSubject !== undefined ? initialSubject : subjectPrefill || '';
    setSubject(nextSubject);
    const nextHtml = initialHtml ?? '';
    setHtml(nextHtml);
    setIncludeQuote(false);

    if (initialHtml !== undefined || initialSubject !== undefined) {
      onPrefillConsumed?.();
    }
  }, [open, toEmail, subjectPrefill, initialHtml, initialSubject, onPrefillConsumed]);

  // Quote HTML
  const quoteHtml = useMemo(() => {
    if (includeQuote && lastMsgHtml) {
      return DOMPurify.sanitize(lastMsgHtml);
    }
    return undefined;
  }, [includeQuote, lastMsgHtml]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to send
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
        e.preventDefault();
        doSend();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function doSend() {
    if (!threadId || !connId || !orgId) return;

    setSending(true);
    try {
      await sendReply({
        org_id: orgId,
        thread_id: threadId,
        connection_id: connId,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        quote_html: quoteHtml,
      });
      onClose();
    } catch (e) {
      alert(String(e));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  const applyDraft = (value: string, subjectOverride?: string) => {
    setHtml(value);
    if (subjectOverride !== undefined) {
      setSubject(subjectOverride);
    }
  };

  useEffect(() => {
    if (!open) return;
    const node = editorRef.current;
    if (!node) return;
    const handler = () => {
      setHtml(node.innerHTML);
    };
    node.addEventListener("input", handler);
    return () => node.removeEventListener("input", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full max-w-xl h-full bg-background border-l shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Reply</h3>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <div className="grid grid-cols-4 items-center gap-2">
          <label className="text-sm opacity-70 col-span-1">From</label>
          <div className="col-span-3">
            <Select value={connId} onValueChange={setConnId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {conns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.account_name || c.account_email} ({c.provider})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="text-sm opacity-70 col-span-1">To</label>
          <Input
            className="col-span-3"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="lead@example.com"
          />

          <label className="text-sm opacity-70 col-span-1">Subject</label>
          <Input
            className="col-span-3"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeQuote}
              onChange={(e) => setIncludeQuote(e.target.checked)}
            />
            Quote last message
          </label>
          <div className="text-xs opacity-60">Cmd/Ctrl + Enter to send</div>
        </div>

        <div className="flex flex-col gap-2">
          {campaignId ? (
            <RewriterBar
              campaignId={campaignId}
              subject={subject}
              setSubject={setSubject}
              value={html}
              setValue={setHtml}
            />
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDraft(`<p>Great -- here's my calendar: ${CAL_LINK}</p>`)}
            >
              Insert Calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDraft(`<p>Here's our pricing overview: ${PRICING_URL}</p>`)}
            >
              Insert Pricing
            </Button>
          </div>

          <div className="flex-1 border rounded-2xl overflow-hidden">
            <div
              ref={editorRef}
              contentEditable
              className="min-h-[220px] p-3 outline-none prose max-w-none"
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={doSend}
            disabled={sending || !to || !subject || !connId}
          >
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

