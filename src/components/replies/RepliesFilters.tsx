'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type RepliesFilterState = {
  campaignId: string;
  q: string;
  from?: string; // yyyy-mm-dd
  to?: string;   // yyyy-mm-dd
  handled: 'all'|'handled'|'unhandled';
};

export function RepliesFilters({ 
  value, 
  onChange, 
  onApply 
}: { 
  value: RepliesFilterState; 
  onChange: (v: RepliesFilterState) => void; 
  onApply: () => void;
}) {
  function set<K extends keyof RepliesFilterState>(k: K, v: RepliesFilterState[K]) {
    onChange({ ...value, [k]: v });
  }

  function exportReplied() {
    const params = new URLSearchParams();
    if (value.campaignId) params.set('campaignId', value.campaignId);
    if (value.from) params.set('dateFrom', value.from);
    if (value.to) params.set('dateTo', value.to);
    if (value.q) params.set('q', value.q);
    const url = `/api/export/replied?${params.toString()}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
      <div className="p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input 
            placeholder="text, email, company…" 
            value={value.q} 
            onChange={(e) => set('q', e.target.value)} 
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Handled</label>
          <Select value={value.handled} onValueChange={(v) => set('handled', v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="unhandled">unhandled</SelectItem>
              <SelectItem value="handled">handled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input 
            type="date" 
            value={value.from ?? ''} 
            onChange={(e) => set('from', e.target.value || undefined)} 
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input 
            type="date" 
            value={value.to ?? ''} 
            onChange={(e) => set('to', e.target.value || undefined)} 
          />
        </div>
        <div className="flex gap-2 justify-end md:justify-start">
          <Button 
            variant="secondary" 
            onClick={() => onChange({ ...value, q: '', handled: 'all', from: undefined, to: undefined })}
          >
            Reset
          </Button>
          <Button onClick={onApply}>Apply</Button>
          <Button onClick={exportReplied}>Export Replied CSV</Button>
        </div>
      </div>
    </div>
  );
}

