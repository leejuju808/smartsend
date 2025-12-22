"use client";

import { useEffect, useState } from 'react';
import { Message, InboxTask } from '@/lib/replies/types';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';

type SuggestionItem = {
  source: 'ai' | 'template';
  subject?: string;
  body_html: string;
  name?: string;
  category?: string;
};

function Suggestions({
  threadId,
  onUse,
}: {
  threadId: string;
  onUse: (html: string, subject?: string) => void;
}) {
  const [sugs, setSugs] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setSugs([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch('/api/suggest-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setSugs(Array.isArray(j.suggestions) ? j.suggestions : []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('suggestions failed', error);
        setSugs([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return (
    <div className="p-3 border rounded-2xl mb-3 bg-background">
      <div className="text-sm font-medium mb-2">Suggestions</div>
      {loading && <div className="text-xs opacity-60 mb-2">Thinking…</div>}
      <div className="grid gap-2">
        {sugs.map((s, i) => (
          <div key={i} className="p-3 rounded-xl border">
            <div className="text-xs opacity-60 mb-1">
              {s.source === 'ai' ? 'AI suggestion' : s.name ?? 'Template'}
            </div>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(s.body_html, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote'],
                  ALLOWED_ATTR: ['href', 'target'],
                }),
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => onUse(s.body_html, s.subject)}>
                Use
              </Button>
            </div>
          </div>
        ))}
        {!loading && sugs.length === 0 && (
          <div className="text-xs opacity-60">No suggestions yet.</div>
        )}
      </div>
    </div>
  );
}

export default function ThreadPane({
  threadId,
  onUseSuggestion,
  tasks,
  onTaskAction,
  taskActionKey,
}: {
  threadId?: string | null;
  onUseSuggestion: (html: string, subject?: string) => void;
  tasks?: InboxTask[];
  onTaskAction?: (taskId: string, status: 'done' | 'dismissed') => void;
  taskActionKey?: string | null;
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      setMsgs(null);
      setLeadStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    import('@/lib/replies/api')
      .then(async (api) => {
        const [threadMessages, meta] = await Promise.all([
          api.fetchThread(threadId),
          api.fetchThreadMeta(threadId),
        ]);

        if (cancelled) return;
        setMsgs(threadMessages);
        setLeadStatus(meta?.lead_status ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error loading thread:', err);
        setMsgs([]);
        setLeadStatus(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (!threadId) {
    return (
      <div className="h-full grid place-items-center opacity-60">
        Select a thread
      </div>
    );
  }

  const calendarHtml = `<p>Great -- here's my calendar: ${process.env.NEXT_PUBLIC_CAL_LINK ?? 'https://cal.com/you/intro'}</p>`;
  const pricingHtml = `<p>Here's our pricing overview: ${process.env.NEXT_PUBLIC_PRICING_URL ?? 'https://smartsendhq.com/pricing'}</p>`;
  const currentTasks = tasks || [];

  const renderMessages = () => {
    if (loading) {
      return (
        <div className="p-6 flex items-center justify-center text-sm opacity-60">
          Loading…
        </div>
      );
    }

    if (!msgs || msgs.length === 0) {
      return (
        <div className="p-6 text-sm opacity-60 text-center">
          No messages found
        </div>
      );
    }

    return msgs.map((m) => {
      const isInbound = m.direction === 'in' || m.direction === 'inbound';
      const aiSegments: string[] = [];

      if ((m as any).ai_label) {
        let labelText = `AI: ${(m as any).ai_label}`;
        if (typeof (m as any).ai_confidence === 'number') {
          labelText += ` (${Math.round((m as any).ai_confidence * 100)}%)`;
        }
        aiSegments.push(labelText);
      } else if (typeof (m as any).ai_confidence === 'number') {
        aiSegments.push(`AI confidence ${Math.round((m as any).ai_confidence * 100)}%`);
      }

      if ((m as any).ai_reason) {
        aiSegments.push((m as any).ai_reason);
      }

      return (
        <div key={m.id} className="rounded-2xl p-4 border bg-card shadow-sm">
          <div className="text-sm opacity-70 mb-2 flex items-center gap-2">
            <span className={isInbound ? 'text-blue-600' : 'text-green-600'}>
              {isInbound ? 'Incoming' : 'Outgoing'}
            </span>
            <span>•</span>
            <span>{new Date(m.sent_at).toLocaleString()}</span>
            <span>•</span>
            <span className="truncate">{m.from_name || m.from_email}</span>
          </div>
          {m.body_html ? (
            <div
              className="prose max-w-none prose-sm"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(m.body_html, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote'],
                  ALLOWED_ATTR: ['href', 'target'],
                }),
              }}
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap opacity-90">
              {m.snippet || '(no content)'}
            </div>
          )}
          {m.attachments && m.attachments.length > 0 && (
            <div className="mt-3 text-sm opacity-80 flex items-center gap-2 flex-wrap">
              <span className="font-medium">Attachments:</span>
              {m.attachments.map((a, idx) => (
                <span key={idx} className="px-2 py-1 rounded bg-muted text-xs">
                  {a.filename}
                  {a.size && ` (${(a.size / 1024).toFixed(1)} KB)`}
                </span>
              ))}
            </div>
          )}
          {aiSegments.length > 0 && (
            <div className="text-xs opacity-60 mt-2">
              {aiSegments.join(' • ')}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3">
        <Suggestions threadId={threadId} onUse={onUseSuggestion} />

        {leadStatus === 'replied' && (
          <div className="flex items-center gap-2 w-fit rounded-full bg-emerald-600/10 text-emerald-600 text-xs px-3 py-1">
            Auto-paused
          </div>
        )}

        {currentTasks.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase opacity-60">Tasks</div>
            <div className="space-y-2">
              {currentTasks.map((task) => {
                const loadingDone = taskActionKey === `${task.task_id}:done`;
                const loadingDismiss = taskActionKey === `${task.task_id}:dismissed`;
                return (
                  <div
                    key={task.task_id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{task.title}</div>
                      {task.due_at && (
                        <div className="text-xs opacity-60">Due {new Date(task.due_at).toLocaleString()}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onTaskAction?.(task.task_id, 'done')}
                        disabled={loadingDone || !onTaskAction}
                      >
                        {loadingDone ? 'Saving…' : 'Mark Done'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onTaskAction?.(task.task_id, 'dismissed')}
                        disabled={loadingDismiss || !onTaskAction}
                      >
                        {loadingDismiss ? 'Saving…' : 'Dismiss'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 space-y-4">
        {renderMessages()}
      </div>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onUseSuggestion(calendarHtml)}>
            Insert Calendar
          </Button>
          <Button variant="outline" onClick={() => onUseSuggestion(pricingHtml)}>
            Insert Pricing
          </Button>
        </div>
      </div>
    </div>
  );
}

