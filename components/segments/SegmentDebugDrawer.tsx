// components/segments/SegmentDebugDrawer.tsx

'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/src/components/ui/drawer';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { DebugLeaf, SegmentDebugResult } from '@/lib/segments/debug';

type LeadDebug = SegmentDebugResult<any>;

type Props = {
  segmentId: string;
  sampleSize?: number;
  triggerClassName?: string;
};

export function SegmentDebugDrawer({
  segmentId,
  sampleSize = 50,
  triggerClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [matched, setMatched] = React.useState<LeadDebug[]>([]);
  const [unmatched, setUnmatched] = React.useState<LeadDebug[]>([]);
  const [activeTab, setActiveTab] = React.useState<'matched' | 'unmatched'>('matched');

  const loadDebugData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/segments/${segmentId}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleSize }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || res.statusText);
      }

      const json = await res.json();
      setMatched(json.matched ?? []);
      setUnmatched(json.unmatched ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load debug data');
    } finally {
      setLoading(false);
    }
  }, [segmentId, sampleSize]);

  // When drawer opens, fetch data
  React.useEffect(() => {
    if (open) {
      void loadDebugData();
    }
  }, [open, loadDebugData]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1', triggerClassName)}
        >
          🧪 Debug rules
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Segment rule debugger</DrawerTitle>
          <p className="text-sm text-muted-foreground mt-1">
            See which leads matched this segment and why each condition passed
            or failed.
          </p>
        </DrawerHeader>

        <div className="px-4 pb-4">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading sample…</p>
          )}
          {error && (
            <p className="text-sm text-destructive">
              Error loading debug data: {error}
            </p>
          )}

          {!loading && !error && (
            <div className="mt-3">
              {/* Simple tab buttons */}
              <div className="flex gap-2 mb-3 border-b">
                <button
                  onClick={() => setActiveTab('matched')}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    activeTab === 'matched'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Matched ({matched.length})
                </button>
                <button
                  onClick={() => setActiveTab('unmatched')}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    activeTab === 'unmatched'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Not matched ({unmatched.length})
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'matched' && (
                <LeadDebugList items={matched} emptyLabel="No matched leads in sample." />
              )}

              {activeTab === 'unmatched' && (
                <LeadDebugList
                  items={unmatched}
                  emptyLabel="No unmatched leads in sample."
                />
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type LeadDebugListProps = {
  items: LeadDebug[];
  emptyLabel: string;
};

function LeadDebugList({ items, emptyLabel }: LeadDebugListProps) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground border rounded-md py-4 px-3">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="h-[48vh] overflow-y-auto rounded-md border">
      <div className="divide-y">
        {items.map((item) => (
          <LeadDebugCard key={item.lead.id ?? JSON.stringify(item.lead)} item={item} />
        ))}
      </div>
    </div>
  );
}

function LeadDebugCard({ item }: { item: LeadDebug }) {
  const lead = item.lead;
  const name =
    [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
  const email = lead.email ?? 'No email';

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </div>
        <Badge variant={item.matched ? 'default' : 'outline'}>
          {item.matched ? 'Matched' : 'Not matched'}
        </Badge>
      </div>

      <div className="mt-1">
        <p className="text-xs font-medium mb-1">Condition breakdown</p>
        <div className="flex flex-col gap-1">
          {item.leaves.map((leaf) => (
            <ConditionRow key={leaf.id} leaf={leaf} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConditionRow({ leaf }: { leaf: DebugLeaf }) {
  return (
    <div className="flex items-start gap-2 rounded-md border px-2 py-1">
      <Badge
        className={cn(
          'text-[10px]',
          leaf.passed ? 'bg-emerald-500 text-white' : 'bg-destructive text-white'
        )}
      >
        {leaf.passed ? 'PASS' : 'FAIL'}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">
          {leaf.field} {leaf.op}{' '}
          {leaf.value !== undefined && leaf.value !== null
            ? JSON.stringify(leaf.value)
            : ''}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Lead value:{' '}
          <span className="font-mono">
            {leaf.leadValue === undefined
              ? 'undefined'
              : JSON.stringify(leaf.leadValue)}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">{leaf.reason}</div>
      </div>
    </div>
  );
}

