"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { SegmentDebugDrawer } from "@/components/segments/SegmentDebugDrawer";

type SegmentMeta = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  min_score: number | null;
  is_active: boolean;
  rule: Record<string, any>;
  lead_segment_members?: { count: number | null }[] | null;
};

type SegmentEditorProps = {
  open: boolean;
  segment?: SegmentMeta | null;
  onClose: () => void;
  onSaved: (segment: SegmentMeta) => void;
};

const EMPTY_RULE = "{\n  \n}";

export function SegmentEditor({ open, segment, onClose, onSaved }: SegmentEditorProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  const [minScore, setMinScore] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [ruleText, setRuleText] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!segment) {
      setName("");
      setDescription("");
      setColor("#0ea5e9");
      setMinScore(0);
      setIsActive(true);
      setRuleText(EMPTY_RULE);
      setError(null);
      return;
    }
    setName(segment.name);
    setDescription(segment.description ?? "");
    setColor(segment.color ?? "#0ea5e9");
    setMinScore(segment.min_score ?? 0);
    setIsActive(segment.is_active);
    setRuleText(JSON.stringify(segment.rule ?? {}, null, 2) || EMPTY_RULE);
    setError(null);
  }, [open, segment]);

  const memberCount = useMemo(() => segment?.lead_segment_members?.[0]?.count ?? 0, [segment]);

  async function handleSubmit() {
    setError(null);
    let parsedRule: Record<string, unknown> = {};
    if (ruleText.trim().length) {
      try {
        parsedRule = JSON.parse(ruleText);
      } catch (err: any) {
        setError(`Rule JSON invalid: ${err.message}`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: description.trim() || null,
        color,
        min_score: Number.isFinite(minScore) ? minScore : 0,
        is_active: isActive,
        rule: parsedRule,
      };

      const isEdit = Boolean(segment?.id);
      const res = await fetch(isEdit ? `/api/segments/${segment?.id}` : "/api/segments", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save segment");
      }

      const json = await res.json();
      onSaved(json);
      onClose();
      toast({
        title: isEdit ? "Segment updated" : "Segment created",
        description: isEdit ? "Recomputed memberships and scores." : "Initial memberships and scores computed.",
      });
    } catch (err: any) {
      setError(err.message ?? "Failed to save segment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{segment ? "Edit segment" : "New segment"}</DialogTitle>
          <DialogDescription>
            Define targeting rules using the JSON DSL. Matching leads will be synced immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="segment-name">Name</Label>
              <Input id="segment-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. US SMBs" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segment-color">Color</Label>
              <div className="flex items-center gap-3">
                <Input id="segment-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 p-1" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="segment-description">Description</Label>
            <Input id="segment-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional summary" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="segment-min-score">Min score</Label>
              <Input
                id="segment-min-score"
                type="number"
                min={0}
                value={Number.isNaN(minScore) ? "" : String(minScore)}
                onChange={(e) => setMinScore(e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center justify-between" htmlFor="segment-active">
                Active
                <Switch id="segment-active" checked={isActive} onCheckedChange={(checked) => setIsActive(Boolean(checked))} />
              </Label>
              {segment && (
                <p className="text-xs text-muted-foreground">
                  Current members: <span className="font-semibold">{memberCount}</span>
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="segment-rule">Rule JSON</Label>
            <Textarea id="segment-rule" rows={12} value={ruleText} onChange={(e) => setRuleText(e.target.value)} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              Supported keys: industry_in, employee_count, country_in, tech_any, tech_all, seniority_in, title_ilike, domain_in.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            {segment?.id && (
              <SegmentDebugDrawer segmentId={segment.id} />
            )}
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </div>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : segment ? "Save changes" : "Create segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

