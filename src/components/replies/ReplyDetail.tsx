'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ReplyRow } from './RepliesList';
import { SmartRepliesSheet } from './SmartRepliesSheet';
import { isSalesModeEnabled } from '@/lib/feature-flags';

export function ReplyDetail({ logId }: { logId: string | null }) {
  const [row, setRow] = React.useState<ReplyRow | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [smartRepliesOpen, setSmartRepliesOpen] = React.useState(false);

  React.useEffect(() => {
    let cancel = false;

    async function run() {
      if (!logId) {
        setRow(null);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('v_reply_logs')
          .select('*')
          .eq('log_id', logId)
          .single();

        if (error) throw error;
        
        if (!cancel) {
          setRow(data);
          setLabel(data.label || '');
        }
      } catch (e: any) {
        console.error('Error loading reply detail:', e);
        alert(e.message ?? String(e));
      } finally {
        if (!cancel) {
          setLoading(false);
        }
      }
    }

    run();
    return () => { cancel = true; };
  }, [logId]);

  if (!logId) {
    return <div className="p-6 text-sm text-muted-foreground">Select a reply.</div>;
  }

  if (loading) {
    return <div className="p-6 text-sm">Loading…</div>;
  }

  if (!row) {
    return <div className="p-6 text-sm">Not found.</div>;
  }

  const subject = row.meta?.subject || '(no subject)';
  const rawPreview = row.meta?.preview || '';
  const cleanPreview = row.meta?.clean_preview || '';

  async function markHandled(v: boolean) {
    if (!row) return;
    
    const { error } = await supabase.rpc('reply_mark_handled', {
      p_log_id: row.log_id,
      p_handled: v,
      p_label: label || null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    // Re-fetch
    const { data } = await supabase
      .from('v_reply_logs')
      .select('*')
      .eq('log_id', row.log_id)
      .single();
    
    setRow(data);
  }

  function copyEmail() {
    if (!row) return;
    navigator.clipboard.writeText(row.email);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">From</div>
        <div className="font-medium">
          {row.first_name || row.last_name 
            ? `${row.first_name} ${row.last_name}`.trim() 
            : row.email}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.email}
          {row.company ? ` · ${row.company}` : ''}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground">Subject</div>
        <div className="font-medium">{subject}</div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground">Preview</div>
        <div className="text-sm whitespace-pre-wrap">{rawPreview}</div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Sanitized preview</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {cleanPreview || "(not captured)"}
        </pre>
      </details>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Button onClick={() => setSmartRepliesOpen(true)}>
          Smart Replies
        </Button>
        <Button onClick={() => markHandled(!row.handled)}>
          {row.handled ? 'Mark unhandled' : 'Mark handled'}
        </Button>
        <Button variant="outline" onClick={copyEmail}>
          Copy email
        </Button>
      </div>

      {row.meta?.thread_url && (
        <a 
          className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm" 
          href={row.meta.thread_url} 
          target="_blank" 
          rel="noreferrer"
        >
          Open email
        </a>
      )}

      {row && (
        <SmartRepliesSheet
          open={smartRepliesOpen}
          onOpenChange={setSmartRepliesOpen}
          row={row}
        />
      )}

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Label</div>
        <Input 
          placeholder="qualified / not_interested / schedule" 
          value={label} 
          onChange={(e) => setLabel(e.target.value)} 
        />
      </div>

      {/* Future: notes box */}
      {!isSalesModeEnabled() ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Notes</div>
          <Textarea disabled placeholder="Notes are not available here." />
        </div>
      ) : null}
    </div>
  );
}

