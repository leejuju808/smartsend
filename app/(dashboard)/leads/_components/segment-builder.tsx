'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type SegmentFilterOp =
  | '='
  | '!='
  | 'contains'
  | 'starts_with'
  | 'in'
  | 'between';

type SegmentFilter = {
  id: string;        // local row id for React key
  field: string;
  op: SegmentFilterOp;
  value: string;     // string for UI, API will convert as needed
  extra?: {
    from?: string;
    to?: string;
  };
};

type SegmentDefinition = {
  id: string;
  name: string;
  description?: string | null;
  filters: any[];
  is_pinned: boolean;
  created_at: string;
};

type Lead = {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  status?: string;
  [key: string]: any;
};

const FIELD_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
  { value: 'created_at', label: 'Created At' },
  { value: 'lead_score', label: 'Lead Score', type: 'number' },
  { value: 'company.intent_score', label: 'Company Intent Score', type: 'number' },
  { value: 'company.is_hot', label: 'Hot Account', type: 'boolean' },
  { value: 'thread.ai_tone', label: 'Reply Tone', type: 'string' },
  { value: 'thread.ai_opportunity_score', label: 'Opportunity Score', type: 'number' },
  { value: 'thread.ai_buyer_role', label: 'Buyer Role', type: 'string' },
];

const OP_OPTIONS: { value: SegmentFilterOp; label: string }[] = [
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'in', label: 'In list' },
  { value: 'between', label: 'Between (range)' },
];

function makeEmptyFilterRow(): SegmentFilter {
  return {
    id: crypto.randomUUID(),
    field: 'email',
    op: 'contains',
    value: '',
  };
}

export function SegmentBuilder() {
  const [segments, setSegments] = useState<SegmentDefinition[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [filters, setFilters] = useState<SegmentFilter[]>([makeEmptyFilterRow()]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingSegments, setIsLoadingSegments] = useState(false);

  // Load segments on mount
  useEffect(() => {
    const loadSegments = async () => {
      try {
        setIsLoadingSegments(true);
        const res = await fetch('/api/segments?kind=lead');
        if (!res.ok) throw new Error('Failed to load segments');
        const json = await res.json();
        setSegments(json.segments || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingSegments(false);
      }
    };

    loadSegments();
  }, []);

  // When a segment is selected, load its state into the builder
  useEffect(() => {
    if (!selectedSegmentId) {
      // reset to blank
      setName('');
      setDescription('');
      setIsPinned(false);
      setFilters([makeEmptyFilterRow()]);
      setLeads([]);
      return;
    }

    const seg = segments.find((s) => s.id === selectedSegmentId);
    if (!seg) return;

    setName(seg.name ?? '');
    setDescription(seg.description ?? '');
    setIsPinned(seg.is_pinned ?? false);

    // map server filters to local rows
    const serverFilters = Array.isArray(seg.filters) ? seg.filters : [];
    if (serverFilters.length === 0) {
      setFilters([makeEmptyFilterRow()]);
    } else {
      const mapped: SegmentFilter[] = serverFilters.map((f: any) => ({
        id: crypto.randomUUID(),
        field: f.field ?? 'email',
        op: (f.op ?? 'contains') as SegmentFilterOp,
        value:
          f.op === 'between'
            ? ''
            : typeof f.value === 'string'
            ? f.value
            : Array.isArray(f.value)
            ? f.value.join(', ')
            : '',
        extra:
          f.op === 'between'
            ? {
                from: f.value?.from ?? '',
                to: f.value?.to ?? '',
              }
            : undefined,
      }));
      setFilters(mapped);
    }

    setLeads([]);
  }, [selectedSegmentId, segments]);

  const updateFilterRow = (id: string, patch: Partial<SegmentFilter>) => {
    setFilters((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const addFilterRow = () => {
    setFilters((prev) => [...prev, makeEmptyFilterRow()]);
  };

  const removeFilterRow = (id: string) => {
    setFilters((prev) => {
      const next = prev.filter((row) => row.id !== id);
      if (next.length === 0) return [makeEmptyFilterRow()];
      return next;
    });
  };

  const toApiFilters = () => {
    return filters.map((f) => {
      if (f.op === 'between') {
        return {
          field: f.field,
          op: f.op,
          value: {
            from: f.extra?.from || null,
            to: f.extra?.to || null,
          },
        };
      }

      if (f.op === 'in') {
        const list = f.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          field: f.field,
          op: f.op,
          value: list,
        };
      }

      return {
        field: f.field,
        op: f.op,
        value: f.value,
      };
    });
  };

  const handleSaveSegment = async () => {
    try {
      setIsSaving(true);

      const payload = {
        name,
        description: description || null,
        kind: 'lead',
        filters: toApiFilters(),
        is_pinned: isPinned,
      };

      let res;
      // update or create
      if (selectedSegmentId) {
        res = await fetch(`/api/segments/${selectedSegmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        console.error('Failed to save segment');
        return;
      }

      const json = await res.json();
      const savedSeg: SegmentDefinition = json.segment;

      // refresh list
      setSegments((prev) => {
        const exists = prev.find((s) => s.id === savedSeg.id);
        if (exists) {
          return prev.map((s) => (s.id === savedSeg.id ? savedSeg : s));
        }
        return [savedSeg, ...prev];
      });

      setSelectedSegmentId(savedSeg.id);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunSegment = async () => {
    try {
      setIsRunning(true);

      let segmentId = selectedSegmentId;

      // If it's a new segment not yet created, save it first
      if (!segmentId) {
        const payload = {
          name: name || 'Untitled segment',
          description: description || null,
          kind: 'lead',
          filters: toApiFilters(),
          is_pinned: isPinned,
        };

        const res = await fetch('/api/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error('Failed to create segment before run');
          return;
        }
        const json = await res.json();
        const savedSeg: SegmentDefinition = json.segment;
        segmentId = savedSeg.id;
        setSelectedSegmentId(savedSeg.id);
        setSegments((prev) => [savedSeg, ...prev]);
      }

      const res = await fetch(`/api/segments/${segmentId}/run`);
      if (!res.ok) {
        console.error('Failed to run segment');
        return;
      }

      const json = await res.json();
      setLeads(json.leads || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleNewSegment = () => {
    setSelectedSegmentId(null);
    setName('');
    setDescription('');
    setIsPinned(false);
    setFilters([makeEmptyFilterRow()]);
    setLeads([]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-4">
      {/* Left column: Saved Views / Segments */}
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Saved Views</CardTitle>
          <Button size="sm" variant="outline" onClick={handleNewSegment}>
            New
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoadingSegments && <p className="text-xs text-muted-foreground">Loading…</p>}

          {segments.length === 0 && !isLoadingSegments && (
            <p className="text-xs text-muted-foreground">
              No segments yet. Create one on the right.
            </p>
          )}

          <div className="space-y-1">
            {segments.map((seg) => (
              <button
                key={seg.id}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted',
                  selectedSegmentId === seg.id && 'border-primary bg-muted',
                )}
                onClick={() => setSelectedSegmentId(seg.id)}
              >
                <div className="flex flex-col">
                  <span className="font-medium truncate">{seg.name}</span>
                  {seg.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {seg.description}
                    </span>
                  )}
                </div>
                {seg.is_pinned && (
                  <Badge className="text-[9px]" variant="outline">
                    Pinned
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Right column: Builder + Result */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedSegmentId ? 'Edit Segment' : 'New Segment'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name + Pin */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1 space-y-1">
                <Label htmlFor="segment-name">Name</Label>
                <Input
                  id="segment-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ICP Fit — SaaS using HubSpot + >50 employees"
                />
              </div>
              <div className="flex items-center gap-2 pt-4 sm:pt-6">
                <input
                  id="segment-pin"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                <Label htmlFor="segment-pin" className="text-xs">
                  Pin in view list
                </Label>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="segment-description">Description</Label>
              <Textarea
                id="segment-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: SaaS tools using HubSpot with at least 50 employees, VP/Director-level contacts."
                rows={2}
              />
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Filters</Label>
                <span className="text-[10px] text-muted-foreground">
                  All filters are combined with AND for now
                </span>
              </div>

              <div className="space-y-2">
                {filters.map((f) => {
                  const isBetween = f.op === 'between';
                  const isIn = f.op === 'in';

                  return (
                    <div
                      key={f.id}
                      className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center"
                    >
                      {/* Field */}
                      <Select
                        value={f.field}
                        onValueChange={(val) => updateFilterRow(f.id, { field: val })}
                      >
                        <SelectTrigger className="w-full sm:w-[150px]">
                          <SelectValue placeholder="Field" />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Operator */}
                      <Select
                        value={f.op}
                        onValueChange={(val) =>
                          updateFilterRow(f.id, { op: val as SegmentFilterOp })
                        }
                      >
                        <SelectTrigger className="w-full sm:w-[150px]">
                          <SelectValue placeholder="Operator" />
                        </SelectTrigger>
                        <SelectContent>
                          {OP_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Value input(s) */}
                      {!isBetween && (
                        <Input
                          className="flex-1"
                          value={f.value}
                          onChange={(e) => updateFilterRow(f.id, { value: e.target.value })}
                          placeholder={
                            isIn ? 'Comma-separated values' : 'Value (e.g. "@gmail.com")'
                          }
                        />
                      )}

                      {isBetween && (
                        <div className="flex flex-1 flex-col gap-1 sm:flex-row">
                          <Input
                            placeholder="From"
                            value={f.extra?.from ?? ''}
                            onChange={(e) =>
                              updateFilterRow(f.id, {
                                extra: { ...(f.extra || {}), from: e.target.value },
                              })
                            }
                          />
                          <Input
                            placeholder="To"
                            value={f.extra?.to ?? ''}
                            onChange={(e) =>
                              updateFilterRow(f.id, {
                                extra: { ...(f.extra || {}), to: e.target.value },
                              })
                            }
                          />
                        </div>
                      )}

                      {/* Remove */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="self-start text-xs text-muted-foreground"
                        onClick={() => removeFilterRow(f.id)}
                      >
                        ✕
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addFilterRow}>
                + Add filter
              </Button>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={handleSaveSegment} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save View'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleRunSegment}
                disabled={isRunning}
              >
                {isRunning ? 'Running…' : 'Run Segment'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Result table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Leads ({leads.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leads.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Run a segment to see matching leads here.
              </p>
            )}

            {leads.length > 0 && (
              <div className="max-h-[320px] overflow-auto rounded-md border text-xs">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="border-b px-2 py-1">Email</th>
                      <th className="border-b px-2 py-1">Name</th>
                      <th className="border-b px-2 py-1">Company</th>
                      <th className="border-b px-2 py-1">Title</th>
                      <th className="border-b px-2 py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/40">
                        <td className="border-b px-2 py-1">{lead.email}</td>
                        <td className="border-b px-2 py-1">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ')}
                        </td>
                        <td className="border-b px-2 py-1">{lead.company}</td>
                        <td className="border-b px-2 py-1">{lead.title}</td>
                        <td className="border-b px-2 py-1">{lead.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



