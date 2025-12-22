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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Scope = 'global' | 'account';
type SuppressionRow = {
  id: string;
  created_at: string;
  updated_at?: string;
  scope: Scope;
  account_id: string | null;
  email: string | null;
  domain: string | null;
  provider: string | null;
  reason: string;
  notes: string | null;
  created_by: string | null;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'Request failed');
  }
  return res.json();
};

export default function SuppressionsPage() {
  const [scope, setScope] = useState<Scope>('account');
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState<'email' | 'domain'>('email');
  const [formValue, setFormValue] = useState('');
  const [formReason, setFormReason] = useState('manual');
  const [formProvider, setFormProvider] = useState('gmail');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const url = `/api/suppressions?scope=${scope}${accountId ? `&account_id=${accountId}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: SuppressionRow[] }>(url, fetcher, {
    keepPreviousData: true,
  });

  const rows = useMemo(() => {
    if (!data?.data) return [];
    const query = search.trim().toLowerCase();
    if (!query) return data.data;
    return data.data.filter((row) => {
      const value = (row.email || row.domain || '').toLowerCase();
      return value.includes(query);
    });
  }, [data, search]);

  const handleAdd = async () => {
    const value = formValue.trim();
    if (!value) {
      toast.error('Enter a value to suppress');
      return;
    }

    if (scope === 'account' && !accountId.trim()) {
      toast.error('Account ID required for account scope');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        scope,
        reason: formReason.trim() || 'manual',
        provider: formProvider,
        notes: formNotes.trim() || null,
      };
      if (scope === 'account') {
        payload.account_id = accountId.trim();
      }
      if (formType === 'email') {
        payload.email = value;
      } else {
        payload.domain = value;
      }

      const res = await fetch('/api/suppressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to add suppression');
      }
      toast.success('Suppression added');
      setDialogOpen(false);
      setFormValue('');
      setFormNotes('');
      mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add suppression';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this suppression?')) return;
    try {
      const res = await fetch(`/api/suppressions?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to remove suppression');
      }
      toast.success('Suppression removed');
      mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to remove suppression';
      toast.error(message);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Suppression List</h1>
          <p className="text-sm text-muted-foreground">
            Block specific emails or domains from receiving messages. Hard bounces are automatically suppressed.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Add Suppression</Button>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={scope === 'global' ? 'default' : 'outline'}
            onClick={() => {
              setScope('global');
              setAccountId('');
            }}
          >
            Global
          </Button>
          <Button
            size="sm"
            variant={scope === 'account' ? 'default' : 'outline'}
            onClick={() => setScope('account')}
          >
            Account
          </Button>
        </div>
        {scope === 'account' && (
          <Input
            className="max-w-xs"
            placeholder="Account ID (optional)"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
        )}
        <Input
          className="ml-auto max-w-xs"
          placeholder="Search value…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      <section className="rounded-xl border bg-background">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading suppressions…
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-destructive">
                    {error.message}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No suppressions found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.email ? 'Email' : 'Domain'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.email || `@${row.domain}`}
                    </TableCell>
                    <TableCell>
                      {row.scope === 'global'
                        ? 'Global'
                        : `Account ${row.account_id?.slice(0, 8) ?? ''}`}
                    </TableCell>
                    <TableCell>{row.provider || '—'}</TableCell>
                    <TableCell className="capitalize">{row.reason || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{row.notes || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(row.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Suppression</DialogTitle>
            <DialogDescription>
              Block an email address or domain from receiving messages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="add-type">
                Type
              </label>
              <select
                id="add-type"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'email' | 'domain')}
              >
                <option value="email">Email</option>
                <option value="domain">Domain</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="add-value">
                {formType === 'email' ? 'Email Address' : 'Domain'}
              </label>
              <Input
                id="add-value"
                placeholder={formType === 'email' ? 'user@example.com' : 'example.com'}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="add-reason">
                  Reason
                </label>
                <select
                  id="add-reason"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="hard_bounce">Hard Bounce</option>
                  <option value="invalid_recipient">Invalid Recipient</option>
                  <option value="complaint">Complaint</option>
                  <option value="policy">Policy</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="add-provider">
                  Provider
                </label>
                <select
                  id="add-provider"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value)}
                >
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="add-notes">
                Notes <span className="text-xs text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="add-notes"
                className="min-h-[80px]"
                placeholder="Additional notes..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? 'Adding…' : 'Add Suppression'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}














