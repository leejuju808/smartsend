'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ThreadList from './ThreadList';
import ThreadPane from './ThreadPane';
import ComposerDrawer from './ComposerDrawer';
import { fetchInbox, setStatus, fetchThread } from '@/lib/replies/api';
import { InboxRow, InboxTask } from '@/lib/replies/types';
import { useHotkeys } from '@/lib/useHotkeys';
import { useReplyDetectionRealtime } from '@/hooks/useReplyDetectionRealtime';
import { useRole } from '@/hooks/useRole';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function Inbox() {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unreplied' | 'replied' | 'needs_review'>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [composerOpen, setComposerOpen] = useState(false);
  const [lastHtml, setLastHtml] = useState<string | undefined>(undefined);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskAction, setTaskAction] = useState<string | null>(null);
  const [prefillHtml, setPrefillHtml] = useState<string | undefined>(undefined);
  const [prefillSubject, setPrefillSubject] = useState<string | undefined>(undefined);
  const role = useRole(campaignId || undefined);
  const supabase = supabaseBrowser();

  const load = useCallback(async (reset = false) => {
    setLoading((prev) => {
      if (prev) return prev; // Already loading, don't start another load
      return true;
    });
    
    try {
      const currentCursor = reset ? undefined : cursor;
      const newRows = await fetchInbox({
        q: q || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        cursor: currentCursor,
      });

      setRows((prev) => {
        if (reset) {
          return newRows;
        } else {
          return [...prev, ...newRows];
        }
      });

      if (newRows.length > 0) {
        setCursor(newRows[newRows.length - 1].last_activity_at);
      }
    } catch (error) {
      console.error('Error loading inbox:', error);
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, cursor]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_inbox_open_tasks')
        .select('*')
        .limit(50);
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setTasksLoading(false);
    }
  }, [supabase]);

  // Refresh inbox when AI detects a reply
  useReplyDetectionRealtime(({ leadId, isReply }) => {
    if (isReply) {
      console.log(`✅ Reply detected for lead ${leadId}, refreshing inbox...`);
      load(true);
      loadTasks();
    }
  });

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const mark = useCallback(async (s: 'replied' | 'needs_review' | 'archived') => {
    if (!selectedId) return;

    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.thread_id === selectedId ? { ...r, status: s } : r))
    );

    try {
      await setStatus(selectedId, s);
      // Reload to ensure consistency
      load(true);
    } catch (error) {
      console.error('Error updating status:', error);
      // Rollback on error
      load(true);
    }
  }, [selectedId, load]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.thread_id === selectedId) || null,
    [rows, selectedId]
  );
  const subjectPrefill = selectedRow
    ? `Re: ${selectedRow.subject || '(no subject)'}`
    : '';
  const toEmail = selectedRow?.lead_email || '';

  // Fetch thread campaign_id and last message html for quote
  useEffect(() => {
    if (!selectedId) {
      setLastHtml(undefined);
      setCampaignId(null);
      return;
    }

    // Fetch campaign_id from thread
    supabase
      .from('email_threads')
      .select('campaign_id')
      .eq('id', selectedId)
      .single()
      .then(({ data }) => {
        if (data?.campaign_id) {
          setCampaignId(data.campaign_id);
        } else {
          // Fallback: try threads table
          supabase
            .from('threads')
            .select('campaign_id')
            .eq('id', selectedId)
            .single()
            .then(({ data: threadData }) => {
              setCampaignId(threadData?.campaign_id || null);
            })
            .catch(() => setCampaignId(null));
        }
      })
      .catch(() => setCampaignId(null));

    fetchThread(selectedId)
      .then((msgs) => {
        const lastMsg = msgs.find((m) => m.direction === 'in');
        setLastHtml(lastMsg?.body_html || undefined);
      })
      .catch((err) => {
        console.error('Error loading thread for quote:', err);
        setLastHtml(undefined);
      });
  }, [selectedId]);

  const handleTaskUpdate = useCallback(async (taskId: string, status: 'done' | 'dismissed') => {
    setTaskAction(`${taskId}:${status}`);
    try {
      const { error } = await supabase
        .from('inbox_tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) throw error;
      setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    } catch (error) {
      console.error('Failed to update task', error);
      alert('Unable to update task. Please try again.');
    } finally {
      setTaskAction(null);
    }
  }, [supabase]);

  const handleSuggestionUse = useCallback((html: string, subject?: string) => {
    setPrefillHtml(html);
    setPrefillSubject(subject);
    setComposerOpen(true);
  }, []);

  const canEdit = role === 'owner' || role === 'editor';
  const viewerTooltip = 'Viewer access — ask the owner to grant Editor to triage.';

  useHotkeys({
    j: () => {
      if (!rows.length) return;
      const idx = Math.max(0, rows.findIndex((r) => r.thread_id === selectedId));
      const next = rows[Math.min(rows.length - 1, idx + 1)];
      setSelectedId(next?.thread_id || null);
    },
    k: () => {
      if (!rows.length) return;
      const idx = Math.max(0, rows.findIndex((r) => r.thread_id === selectedId));
      const prev = rows[Math.max(0, idx - 1)];
      setSelectedId(prev?.thread_id || null);
    },
    r: () => mark('replied'),
    e: () => mark('archived'),
  });

  const taskThreadIds = useMemo(() => new Set(tasks.map((t) => t.thread_id)), [tasks]);
  const threadTasks = useMemo(
    () => (selectedId ? tasks.filter((t) => t.thread_id === selectedId) : []),
    [tasks, selectedId]
  );
  const taskActionKey = taskAction;

  return (
    <div className="h-[calc(100vh-80px)] grid grid-cols-12 gap-0 border-t">
      <div className="col-span-5 border-r h-full flex flex-col">
        <div className="p-3 flex gap-2 items-center border-b">
          <Input
            placeholder="Search subject/name/email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="px-3 py-2 border-b space-y-2">
          <div className="text-xs font-semibold uppercase opacity-60">Open Tasks</div>
          {tasksLoading ? (
            <div className="text-xs opacity-60">Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div className="text-xs opacity-50">No open tasks</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tasks.map((task) => {
                const loadingDone = taskActionKey === `${task.task_id}:done`;
                const loadingDismiss = taskActionKey === `${task.task_id}:dismissed`;
                return (
                  <div
                    key={task.task_id}
                    className="rounded-full border px-3 py-1 bg-muted/40 text-xs flex items-center gap-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{task.title}</span>
                      {task.due_at && (
                        <span className="opacity-60">Due {new Date(task.due_at).toLocaleString()}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTaskUpdate(task.task_id, 'done')}
                        disabled={loadingDone}
                      >
                        {loadingDone ? 'Saving…' : 'Done'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTaskUpdate(task.task_id, 'dismissed')}
                        disabled={loadingDismiss}
                      >
                        {loadingDismiss ? 'Saving…' : 'Dismiss'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-3 pb-2 pt-3">
          <Tabs defaultValue="all" value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unreplied">Unreplied</TabsTrigger>
              <TabsTrigger value="replied">Replied</TabsTrigger>
              <TabsTrigger value="needs_review">Needs Review</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-auto">
          <ThreadList
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loadMore={() => load(false)}
            taskThreadIds={taskThreadIds}
          />
          {loading && rows.length === 0 && (
            <div className="p-4 text-sm opacity-60 text-center">Loading…</div>
          )}
        </div>
      </div>
      <div className="col-span-7 h-full flex flex-col">
        <div className="p-2 border-b flex items-center gap-2 bg-muted/30">
          <Button
            variant="default"
            size="sm"
            onClick={() => setComposerOpen(true)}
            disabled={!selectedId || !canEdit}
            title={!canEdit && campaignId ? viewerTooltip : undefined}
          >
            Reply
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => mark('replied')}
                    disabled={!selectedId || !canEdit}
                  >
                    Mark as Replied (r)
                  </Button>
                </span>
              </TooltipTrigger>
              {!canEdit && campaignId && (
                <TooltipContent>
                  <p>{viewerTooltip}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => mark('needs_review')}
                    disabled={!selectedId || !canEdit}
                  >
                    Needs Review
                  </Button>
                </span>
              </TooltipTrigger>
              {!canEdit && campaignId && (
                <TooltipContent>
                  <p>{viewerTooltip}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mark('archived')}
                    disabled={!selectedId || !canEdit}
                  >
                    Archive (e)
                  </Button>
                </span>
              </TooltipTrigger>
              {!canEdit && campaignId && (
                <TooltipContent>
                  <p>{viewerTooltip}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex-1 overflow-hidden">
          <ThreadPane
            threadId={selectedId}
            onUseSuggestion={handleSuggestionUse}
            tasks={threadTasks}
            onTaskAction={handleTaskUpdate}
            taskActionKey={taskActionKey}
          />
        </div>
      </div>

      <ComposerDrawer
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          // Refresh thread list after sending
          load(true);
          loadTasks();
        }}
        threadId={selectedId}
        toEmail={toEmail}
        subjectPrefill={subjectPrefill}
        lastMsgHtml={lastHtml || null}
        initialHtml={prefillHtml}
        initialSubject={prefillSubject}
        onPrefillConsumed={() => {
          setPrefillHtml(undefined);
          setPrefillSubject(undefined);
        }}
        campaignId={campaignId}
      />
    </div>
  );
}

