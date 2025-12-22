'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export type ReplyRow = {
  log_id: string;
  replied_at: string;
  campaign_id: string;
  lead_id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  meta: any; // { subject?, preview? }
  handled: boolean;
  label: string | null;
};

export function RepliesList({ 
  campaignId, 
  filters, 
  onSelect 
}: { 
  campaignId: string; 
  filters: { q: string; from?: string; to?: string; handled: 'all'|'handled'|'unhandled' }; 
  onSelect: (id: string) => void;
}) {
  const [rows, setRows] = React.useState<ReplyRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancel = false;

    async function run() {
      setLoading(true);
      try {
        let q = supabase
          .from('v_reply_logs')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('replied_at', { ascending: false });

        if (filters.handled !== 'all') {
          q = q.eq('handled', filters.handled === 'handled');
        }
        
        if (filters.from) {
          q = q.gte('replied_at', new Date(filters.from + 'T00:00:00Z').toISOString());
        }
        
        if (filters.to) {
          q = q.lte('replied_at', new Date(filters.to + 'T23:59:59Z').toISOString());
        }
        
        if (filters.q) {
          q = q.or(
            `email.ilike.%${filters.q}%,first_name.ilike.%${filters.q}%,last_name.ilike.%${filters.q}%,company.ilike.%${filters.q}%,meta->>subject.ilike.%${filters.q}%,meta->>preview.ilike.%${filters.q}%,meta->>clean_preview.ilike.%${filters.q}%`
          );
        }

        const { data, error } = await q;
        if (error) throw error;
        
        if (!cancel) {
          setRows((data ?? []) as ReplyRow[]);
        }
      } catch (e: any) {
        console.error('Error loading replies:', e);
        alert(e.message ?? String(e));
      } finally {
        if (!cancel) {
          setLoading(false);
        }
      }
    }

    run();
    return () => { cancel = true; };
  }, [campaignId, filters.q, filters.from, filters.to, filters.handled]);

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <div className="p-6 text-sm text-muted-foreground">No replies match your filters.</div>;
  }

  return (
    <div className="divide-y">
      {rows.map(r => {
        const name = [r.first_name, r.last_name].filter(Boolean).join(' ');
        const subject = r.meta?.subject || '(no subject)';
        const preview = r.meta?.clean_preview || r.meta?.preview || '';

        return (
          <button
            key={r.log_id}
            onClick={() => onSelect(r.log_id)}
            className="w-full text-left p-3 hover:bg-muted/50 focus:bg-muted/60"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium truncate">
                {name || r.email} 
                {r.company && <span className="text-muted-foreground font-normal"> · {r.company}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(r.replied_at).toLocaleString()}
              </div>
            </div>
            <div className="text-sm truncate">{subject}</div>
            <div className="text-xs text-muted-foreground truncate">{preview}</div>
            <div className="mt-1 flex items-center gap-2">
              {!r.handled && <Badge>new</Badge>}
              {r.label && <Badge variant="secondary">{r.label}</Badge>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

