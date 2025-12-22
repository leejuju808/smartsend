'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Scope = 'global' | 'account' | 'campaign';
type Kind = 'email' | 'domain' | 'role';
type KindFilter = 'all' | Kind;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'Request failed');
  }
  return res.json();
};

type SuppressionRow = {
  id: string;
  scope: Scope;
  account_id: string | null;
  campaign_id: string | null;
  kind: Kind;
  value: string;
  reason: string | null;
  note: string | null;
  created_at: string;
};

function buildKey(scope: Scope, accountId: string, campaignId: string, kindFilter: KindFilter) {
  if (scope === 'account' && !accountId) return null;
  if (scope === 'campaign' && !campaignId) return null;
  const params = new URLSearchParams({ scope });
  if (scope === 'account' && accountId) params.set('account_id', accountId);
  if (scope === 'campaign' && campaignId) params.set('campaign_id', campaignId);
  if (kindFilter !== 'all') params.set('kind', kindFilter);
  return `/api/suppressions/list?${params.toString()}`;
}

export default function SuppressionsClient() {
  const [scope, setScope] = useState<Scope>('global');
  const [accountId, setAccountId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formKind, setFormKind] = useState<Kind>('email');
  const [formValues, setFormValues] = useState('');
  const [formReason, setFormReason] = useState('manual');
  const [formNote, setFormNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const key = buildKey(scope, accountId.trim(), campaignId.trim(), kindFilter);
  const { data, error, isLoading, mutate } = useSWR<SuppressionRow[]>(key, fetcher, {
    keepPreviousData: true,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    if (!query) return data;
    return data.filter((row) => row.value.toLowerCase().includes(query));
  }, [data, search]);

  const handleScopeChange = (next: Scope) => {
    setScope(next);
    if (next === 'global') {
      setAccountId('');
      setCampaignId('');
    } else if (next === 'account') {
      setCampaignId('');
    }
  };

  const handleAdd = async () => {
    const valueList = formValues
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean);

    if (!valueList.length) {
      toast.error('Enter at least one value to suppress');
      return;
    }

    if (scope === 'account' && !accountId.trim()) {
      toast.error('Account ID required for account scope');
      return;
    }
    if (scope === 'campaign' && !campaignId.trim()) {
      toast.error('Campaign ID required for campaign scope');
      return;
    }

    const payload: Record<string, unknown> = {
      scope,
      kind: formKind,
      values: valueList,
      reason: formReason.trim() || 'manual',
      note: formNote.trim() || null,
    };
    if (scope === 'account') {
      payload.account_id = accountId.trim();
    }
    if (scope === 'campaign') {
      payload.campaign_id = campaignId.trim();
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/suppressions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to add suppression');
      }
      toast.success('Suppression saved');
      setDialogOpen(false);
      setFormValues('');
      setFormNote('');
      mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add suppression';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams({ scope });
    if (scope === 'account' && accountId.trim()) params.set('account_id', accountId.trim());
    if (scope === 'campaign' && campaignId.trim()) params.set('campaign_id', campaignId.trim());
    window.open(`/api/suppressions/export.csv?${params.toString()}`, '_blank');
  };

  const emptyState =
    !key ? 'Select scope details to view suppressions.' : error ? error.message : 'No suppressions yet.';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Suppression Manager</h1>
          <p className="text-sm text-muted-foreground">
            Block specific emails, domains, or role addresses across global, account, or campaign scope.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!key}>
            Export CSV
          </Button>
          <Button onClick={() => setDialogOpen(true)}>Add Suppressions</Button>
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={scope === 'global' ? 'default' : 'outline'}
            onClick={() => handleScopeChange('global')}
          >
            Global
          </Button>
          <Button
            size="sm"
            variant={scope === 'account' ? 'default' : 'outline'}
            onClick={() => handleScopeChange('account')}
          >
            Account
          </Button>
          <Button
            size="sm"
            variant={scope === 'campaign' ? 'default' : 'outline'}
            onClick={() => handleScopeChange('campaign')}
          >
            Campaign
          </Button>
        </div>
        {scope !== 'global' && (
          <Input
            className="max-w-xs"
            placeholder="Account ID (uuid)"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          />
        )}
        {scope === 'campaign' && (
          <Input
            className="max-w-xs"
            placeholder="Campaign ID (uuid)"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          />
        )}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Kind</label>
          <select
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as KindFilter)}
          >
            <option value="all">All</option>
            <option value="email">Email</option>
            <option value="domain">Domain</option>
            <option value="role">Role</option>
          </select>
        </div>
        <Input
          className="ml-auto max-w-xs"
          placeholder="Search value…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </section>

      <section className="rounded-xl border bg-background">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Kind</th>
                <th className="px-3 py-2 text-left font-medium">Scope</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
                <th className="px-3 py-2 text-left font-medium">Note</th>
                <th className="px-3 py-2 text-left font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-none hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{row.value}</td>
                  <td className="px-3 py-2 capitalize">{row.kind}</td>
                  <td className="px-3 py-2">
                    {row.scope === 'global'
                      ? 'Global'
                      : row.scope === 'account'
                        ? `Account ${row.account_id?.slice(0, 8) ?? ''}`
                        : `Campaign ${row.campaign_id?.slice(0, 8) ?? ''}`}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.reason ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.note ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!rows.length || !key) && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {isLoading ? 'Loading suppressions…' : emptyState}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add suppressions</DialogTitle>
            <DialogDescription>
              Paste one value per line or comma separated. Values are normalized automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="add-kind">
                Kind
              </label>
              <select
                id="add-kind"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={formKind}
                onChange={(event) => setFormKind(event.target.value as Kind)}
              >
                <option value="email">Email</option>
                <option value="domain">Domain</option>
                <option value="role">Role (localpart)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="add-values">
                Values
              </label>
              <Textarea
                id="add-values"
                className="min-h-[140px]"
                placeholder="user@example.com&#10;another@example.com"
                value={formValues}
                onChange={(event) => setFormValues(event.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="add-reason">
                  Reason
                </label>
                <Input
                  id="add-reason"
                  value={formReason}
                  onChange={(event) => setFormReason(event.target.value)}
                  placeholder="manual"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="add-note">
                  Note <span className="text-xs text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="add-note"
                  value={formNote}
                  onChange={(event) => setFormNote(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? 'Adding…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
