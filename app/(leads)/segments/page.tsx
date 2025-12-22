"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { SegmentEditor } from "./SegmentEditor";

type SegmentRecord = {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
  min_score: number | null;
  rule: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  lead_segment_members?: { count: number | null }[] | null;
};

export default function SegmentsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<SegmentRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SegmentRecord | null>(null);
  const [recomputingId, setRecomputingId] = useState<string | null>(null);

  async function loadSegments() {
    setLoading(true);
    try {
      const res = await fetch("/api/segments", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setSegments(data);
    } catch (err: any) {
      toast({ description: err.message ?? "Failed to load segments", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSegments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMembers = useMemo(
    () =>
      segments.reduce((sum, seg) => sum + (seg.lead_segment_members?.[0]?.count ?? 0), 0),
    [segments]
  );

  async function handleRecompute(segment: SegmentRecord) {
    setRecomputingId(segment.id);
    try {
      const res = await fetch(`/api/segments/${segment.id}/recompute`, { method: "POST" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      toast({ description: `Recomputed ${segment.name}.` });
      await loadSegments();
    } catch (err: any) {
      toast({ description: err.message ?? "Failed to recompute segment", variant: "destructive" });
    } finally {
      setRecomputingId(null);
    }
  }

  function handleOpenCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function handleEdit(segment: SegmentRecord) {
    setEditing(segment);
    setEditorOpen(true);
  }

  async function handleSaved(_: SegmentRecord) {
    await loadSegments();
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Segments</h1>
          <p className="text-sm text-muted-foreground">
            Create rule-based segments and manage memberships.
          </p>
        </div>
        <Button onClick={handleOpenCreate}>New segment</Button>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Total segments: <strong>{segments.length}</strong></span>
        <span>Total members across segments: <strong>{totalMembers}</strong></span>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Active</th>
              <th className="p-3">Min score</th>
              <th className="p-3">Members</th>
              <th className="p-3 w-[160px] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-3" colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : segments.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No segments yet. Create one to get started.
                </td>
              </tr>
            ) : (
              segments.map((segment) => {
                const memberCount = segment.lead_segment_members?.[0]?.count ?? 0;
                return (
                  <tr key={segment.id} className="border-t">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border"
                          style={{ backgroundColor: segment.color ?? "#0ea5e9" }}
                        />
                        <div>
                          <div className="font-medium">{segment.name}</div>
                          {segment.description && <div className="text-xs text-muted-foreground">{segment.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={segment.is_active ? "default" : "secondary"}>
                        {segment.is_active ? "Active" : "Paused"}
                      </Badge>
                    </td>
                    <td className="p-3">{segment.min_score ?? 0}</td>
                    <td className="p-3">{memberCount}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRecompute(segment)}
                          disabled={recomputingId === segment.id}
                        >
                          {recomputingId === segment.id ? "Recomputing…" : "Recompute"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(segment)}>
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SegmentEditor
        open={editorOpen}
        segment={editing ?? undefined}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </main>
  );
}

